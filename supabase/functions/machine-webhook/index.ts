import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return jsonResponse({ error: "Missing token" }, 401);

    const body = await req.json();
    const { company_id, machine_id, total_rotations, rpm, is_running, uptime_ms, wifi_rssi } = body;

    if (!company_id || !machine_id) {
      return jsonResponse({ error: "Missing company_id or machine_id" }, 400);
    }

    // Validate RPM (max 50, as per docs)
    const safeRpm = typeof rpm === "number" && rpm >= 0 && rpm <= 50 ? Math.round(rpm * 10) / 10 : 0;

    // 1. Validate device token + company + machine
    const { data: device } = await supabase
      .from("iot_devices")
      .select("machine_id, company_id")
      .eq("token", token)
      .eq("machine_id", machine_id)
      .eq("company_id", company_id)
      .eq("active", true)
      .single();

    if (!device) return jsonResponse({ error: "Unauthorized — token/company/machine mismatch" }, 401);

    // 2. Update last_seen_at
    await supabase
      .from("iot_devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("token", token);

    // 3. Check machine status
    const { data: machine } = await supabase
      .from("machines")
      .select("status, article_id, rpm as target_rpm, production_mode")
      .eq("id", machine_id)
      .single();

    if (!machine) return jsonResponse({ error: "Machine not found" }, 404);

    // If machine is inactive, ignore readings entirely
    if (machine.status === "inativa") {
      return jsonResponse({ ok: true, ignored: true, reason: "machine_inactive" });
    }

    // 4. Save raw reading
    await supabase.from("machine_readings").insert({
      machine_id: device.machine_id,
      company_id: device.company_id,
      total_rotations,
      rpm: safeRpm,
      is_running: is_running ?? (safeRpm > 0),
      uptime_ms,
      wifi_rssi,
    });

    // 5. Update machine RPM in real-time
    await supabase
      .from("machines")
      .update({ rpm: Math.round(safeRpm) })
      .eq("id", machine_id);

    // 6. Get previous reading to calculate delta
    const { data: lastReadings } = await supabase
      .from("machine_readings")
      .select("total_rotations, created_at")
      .eq("machine_id", device.machine_id)
      .order("created_at", { ascending: false })
      .limit(2);

    const lastReading = lastReadings && lastReadings.length > 1 ? lastReadings[1] : null;

    let deltaRotations = 0;
    if (lastReading) {
      if (total_rotations < lastReading.total_rotations) {
        // ESP32 restarted — treat total as delta
        deltaRotations = total_rotations;
      } else {
        deltaRotations = total_rotations - lastReading.total_rotations;
      }

      // Safety: max delta per interval (50 RPM * 10s = ~8.3 rotations max)
      const maxDelta = 50 * 12; // generous margin
      if (deltaRotations > maxDelta) deltaRotations = 0; // corrupted data
    }

    // 7. Get shift settings
    const { data: settings } = await supabase
      .from("company_settings")
      .select("shift_manha_start, shift_manha_end, shift_tarde_start, shift_tarde_end, shift_noite_start, shift_noite_end")
      .eq("company_id", device.company_id)
      .single();

    const currentShift = settings ? determineShift(settings) : "manha";

    // 8. Handle downtime detection
    const machineIsActive = machine.status === "ativa";
    const running = is_running ?? (safeRpm > 0);

    if (!running && machineIsActive) {
      // Check if there's an open downtime event
      const { data: openDowntime } = await supabase
        .from("iot_downtime_events")
        .select("id")
        .eq("machine_id", machine_id)
        .is("ended_at", null)
        .single();

      if (!openDowntime) {
        // Start new downtime event
        await supabase.from("iot_downtime_events").insert({
          machine_id,
          company_id,
          started_at: new Date().toISOString(),
          shift: currentShift,
        });
      }
    } else if (running) {
      // Close any open downtime
      const { data: openDowntime } = await supabase
        .from("iot_downtime_events")
        .select("id, started_at")
        .eq("machine_id", machine_id)
        .is("ended_at", null)
        .single();

      if (openDowntime) {
        const endedAt = new Date();
        const startedAt = new Date(openDowntime.started_at);
        const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

        await supabase
          .from("iot_downtime_events")
          .update({
            ended_at: endedAt.toISOString(),
            duration_seconds: durationSeconds,
          })
          .eq("id", openDowntime.id);
      }
    }

    // 9. Update shift state (accumulate turns + RPM tracking)
    if (deltaRotations > 0 && machine.article_id) {
      await updateShiftState(supabase, device, deltaRotations, safeRpm, machine, currentShift);
    } else if (safeRpm > 0 && machine.article_id) {
      // Even without delta rotations, track RPM for average calculation
      await trackRpm(supabase, device.machine_id, safeRpm);
    }

    // 10. Check shift change
    await checkShiftChange(supabase, device, settings, currentShift);

    return jsonResponse({ ok: true, delta: deltaRotations, shift: currentShift });
  } catch (err) {
    console.error("machine-webhook error:", err);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});

function determineShift(settings: any): string {
  const now = new Date();
  // Convert to Brasilia time (UTC-3)
  const brasiliaOffset = -3 * 60;
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const brasiliaMinutes = ((utcMinutes + brasiliaOffset) + 1440) % 1440;
  const currentTime = `${String(Math.floor(brasiliaMinutes / 60)).padStart(2, "0")}:${String(brasiliaMinutes % 60).padStart(2, "0")}`;

  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };

  const cur = toMinutes(currentTime);
  const ms = toMinutes(settings.shift_manha_start);
  const me = toMinutes(settings.shift_manha_end);
  const ts = toMinutes(settings.shift_tarde_start);
  const te = toMinutes(settings.shift_tarde_end);

  // Morning: ms <= cur < me
  if (cur >= ms && cur < me) return "manha";
  // Afternoon: ts <= cur < te
  if (cur >= ts && cur < te) return "tarde";
  // Night: everything else
  return "noite";
}

// Track RPM for average calculation without delta rotations
async function trackRpm(supabase: any, machineId: string, rpm: number) {
  const { data: state } = await supabase
    .from("iot_shift_state")
    .select("id, rpm_sum, rpm_count")
    .eq("machine_id", machineId)
    .single();

  if (!state) return;

  await supabase
    .from("iot_shift_state")
    .update({
      rpm_sum: (state.rpm_sum || 0) + rpm,
      rpm_count: (state.rpm_count || 0) + 1,
      last_rpm: rpm,
      updated_at: new Date().toISOString(),
    })
    .eq("id", state.id);
}

async function updateShiftState(
  supabase: any,
  device: any,
  deltaRotations: number,
  rpm: number,
  machine: any,
  currentShift: string
) {
  const { machine_id, company_id } = device;

  // Get or create shift state
  let { data: state } = await supabase
    .from("iot_shift_state")
    .select("*")
    .eq("machine_id", machine_id)
    .single();

  if (!state) {
    // Get weaver assignment for this shift
    const weaver = await getAssignedWeaver(supabase, machine_id, company_id, currentShift);

    const { data: newState } = await supabase
      .from("iot_shift_state")
      .insert({
        machine_id,
        company_id,
        current_shift: currentShift,
        weaver_id: weaver?.weaver_id || null,
        article_id: machine.article_id,
        partial_turns: 0,
        total_turns: 0,
        completed_rolls: 0,
        roll_position: 0,
        last_rpm: rpm,
        rpm_sum: rpm,
        rpm_count: 1,
      })
      .select()
      .single();

    state = newState;
    if (!state) return;
  }

  // Get turns per roll
  const { data: amt } = await supabase
    .from("article_machine_turns")
    .select("turns_per_roll")
    .eq("article_id", machine.article_id)
    .eq("machine_id", machine_id)
    .single();

  const { data: article } = await supabase
    .from("articles")
    .select("turns_per_roll, weight_per_roll, value_per_kg")
    .eq("id", machine.article_id)
    .single();

  const turnsPerRoll = amt?.turns_per_roll || article?.turns_per_roll || 0;
  if (turnsPerRoll === 0) return;

  // Accumulate turns — roll_position tracks position within current roll
  const newRollPosition = (state.roll_position || 0) + deltaRotations;
  const completedRolls = Math.floor(newRollPosition / turnsPerRoll);
  const remainingRollPosition = newRollPosition % turnsPerRoll;

  // partial_turns = remainder within current roll (FIX: was accumulating like total_turns)
  await supabase
    .from("iot_shift_state")
    .update({
      partial_turns: remainingRollPosition,
      total_turns: (state.total_turns || 0) + deltaRotations,
      completed_rolls: (state.completed_rolls || 0) + completedRolls,
      roll_position: remainingRollPosition,
      last_rpm: rpm,
      rpm_sum: (state.rpm_sum || 0) + rpm,
      rpm_count: (state.rpm_count || 0) + 1,
      article_id: machine.article_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", state.id);
}

async function checkShiftChange(supabase: any, device: any, settings: any, currentShift: string) {
  if (!settings) return;

  const { data: state } = await supabase
    .from("iot_shift_state")
    .select("*")
    .eq("machine_id", device.machine_id)
    .single();

  if (!state || state.current_shift === currentShift) return;

  // Shift changed! Finalize previous shift
  await finalizeShift(supabase, device, state);
  await startNewShift(supabase, device, currentShift, state.roll_position);
}

async function finalizeShift(supabase: any, device: any, state: any) {
  if (!state.article_id || state.total_turns === 0) return;

  const { data: article } = await supabase
    .from("articles")
    .select("name, turns_per_roll, weight_per_roll, value_per_kg, target_efficiency")
    .eq("id", state.article_id)
    .single();

  if (!article || !article.turns_per_roll) return;

  // Get machine-specific turns if available
  const { data: amt } = await supabase
    .from("article_machine_turns")
    .select("turns_per_roll")
    .eq("article_id", state.article_id)
    .eq("machine_id", state.machine_id)
    .single();

  const turnsPerRoll = amt?.turns_per_roll || article.turns_per_roll;

  // Proportional credit
  const fractionalRolls = state.total_turns / turnsPerRoll;
  const weightKg = fractionalRolls * (article.weight_per_roll || 0);
  const revenue = weightKg * (article.value_per_kg || 0);

  // Get machine info
  const { data: machine } = await supabase
    .from("machines")
    .select("name, rpm as target_rpm")
    .eq("id", state.machine_id)
    .single();

  // Get weaver info
  let weaverName = null;
  if (state.weaver_id) {
    const { data: weaver } = await supabase
      .from("weavers")
      .select("name")
      .eq("id", state.weaver_id)
      .single();
    weaverName = weaver?.name;
  }

  // Calculate efficiency using AVERAGE RPM (FIX: was using last_rpm)
  const shiftStarted = new Date(state.shift_started_at);
  const now = new Date();
  const shiftMinutes = (now.getTime() - shiftStarted.getTime()) / 60000;

  // Get downtime during this shift (unjustified only — machine was 'ativa')
  const { data: downtimes } = await supabase
    .from("iot_downtime_events")
    .select("duration_seconds")
    .eq("machine_id", state.machine_id)
    .gte("started_at", state.shift_started_at)
    .not("duration_seconds", "is", null);

  const downtimeMinutes = (downtimes || []).reduce(
    (sum: number, d: any) => sum + (d.duration_seconds || 0) / 60, 0
  );

  // Get maintenance time from machine_logs (justified stops)
  const { data: maintenanceLogs } = await supabase
    .from("machine_logs")
    .select("status, started_at, ended_at")
    .eq("machine_id", state.machine_id)
    .neq("status", "ativa")
    .gte("started_at", state.shift_started_at);

  const maintenanceMinutes = (maintenanceLogs || []).reduce((sum: number, log: any) => {
    const start = new Date(log.started_at);
    const end = log.ended_at ? new Date(log.ended_at) : now;
    return sum + (end.getTime() - start.getTime()) / 60000;
  }, 0);

  const availableMinutes = Math.max(shiftMinutes - maintenanceMinutes, 1);
  const uptimeMinutes = Math.max(availableMinutes - downtimeMinutes, 0);
  const targetRpm = machine?.target_rpm || 25;

  // FIX: Use average RPM instead of last RPM
  const avgRpm = (state.rpm_count > 0) ? (state.rpm_sum / state.rpm_count) : (state.last_rpm || 0);
  const efficiency = availableMinutes > 0
    ? (uptimeMinutes / availableMinutes) * (avgRpm / targetRpm) * 100
    : 0;

  // Today's date in Brasilia
  const brasiliaDate = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const dateStr = brasiliaDate.toISOString().split("T")[0];

  // Insert production record
  await supabase.from("productions").insert({
    company_id: device.company_id,
    machine_id: state.machine_id,
    machine_name: machine?.name || null,
    weaver_id: state.weaver_id,
    weaver_name: weaverName,
    article_id: state.article_id,
    article_name: article.name,
    date: dateStr,
    shift: state.current_shift,
    rolls_produced: Math.round(fractionalRolls * 100) / 100,
    weight_kg: Math.round(weightKg * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    rpm: Math.round(avgRpm),
    efficiency: Math.round(efficiency * 100) / 100,
    created_by_name: "IoT",
    created_by_code: "IOT",
  });
}

async function startNewShift(supabase: any, device: any, newShift: string, rollPosition: number) {
  const { machine_id, company_id } = device;

  // Get machine's current article
  const { data: machine } = await supabase
    .from("machines")
    .select("article_id")
    .eq("id", machine_id)
    .single();

  // Get assigned weaver for new shift
  const weaver = await getAssignedWeaver(supabase, machine_id, company_id, newShift);

  // Reset shift state
  await supabase
    .from("iot_shift_state")
    .update({
      current_shift: newShift,
      weaver_id: weaver?.weaver_id || null,
      article_id: machine?.article_id || null,
      partial_turns: 0,
      total_turns: 0,
      completed_rolls: 0,
      roll_position: rollPosition, // Maintain physical roll position
      last_rpm: 0,
      rpm_sum: 0,
      rpm_count: 0,
      shift_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("machine_id", machine_id);
}

async function getAssignedWeaver(supabase: any, machineId: string, companyId: string, shift: string) {
  // First try iot_machine_assignments
  const { data: assignment } = await supabase
    .from("iot_machine_assignments")
    .select("weaver_id")
    .eq("machine_id", machineId)
    .eq("company_id", companyId)
    .eq("shift", shift)
    .eq("active", true)
    .single();

  if (assignment) return assignment;

  // Fallback: find weaver with fixed shift matching
  const { data: weaver } = await supabase
    .from("weavers")
    .select("id as weaver_id")
    .eq("company_id", companyId)
    .eq("shift_type", "fixo")
    .eq("fixed_shift", shift)
    .limit(1)
    .single();

  return weaver;
}

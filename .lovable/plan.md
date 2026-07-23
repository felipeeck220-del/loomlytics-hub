# Edição autorizada de OFRs Finalizadas

Permite que admins autorizem a edição de uma OFR já finalizada. O freteiro vinculado passa a ver a OFR em uma nova aba "Editar" (antes de "Finalizados") e pode ajustar **apenas o valor do frete e as fotos** (remover / adicionar, mantendo 1–2). Ao salvar, a OFR retorna a Finalizados marcada como editada, com trilha comparativa (antes × depois) visível nos Detalhes.

## Banco de dados

Nova migração:

- `freight_orders`: colunas
  - `edit_authorized` boolean default false
  - `edit_authorized_at`, `edit_authorized_by` (profile), `edit_authorized_reason` text
  - `edited_at`, `edited_by` (profile)
  - `previous_price_per_kg` numeric, `previous_total` numeric  (snapshot do último salvo)
- Nova tabela `freight_order_edit_photos` para preservar as fotos antigas quando o freteiro remove/troca:
  - `id, freight_order_id, company_id, storage_path, description, replaced_at, replaced_by`
  - GRANTs + RLS por `company_id`, leitura também para freteiro dono da OFR.
- Realtime: publicar a nova tabela e `REPLICA IDENTITY FULL`.

Nenhum drop; retrocompatível.

## Backend / Hook `useFreightOrders`

- Nova query key `['freight_orders', company_id]` já lê os novos campos + join `edit_photos` e `edit_authorizer`, `editor` (profiles).
- Novas mutations:
  - `authorizeEdit(orderId, reason)` — admin/lider_frete apenas. Grava `edit_authorized=true`, autor, motivo. Push para o freteiro vinculado ("OFR #N liberada para edição").
  - `revokeEditAuthorization(orderId)` — admin cancela a autorização antes de o freteiro salvar.
  - `saveFreighterEdit(orderId, { pricePerKg, addPhotos, removePhotoIds, docType?, docNumber? })` — permitido só quando `edit_authorized=true` e para o freteiro dono (ou admin). Fluxo:
    1. Snapshot: se `previous_price_per_kg` for null, copia valor atual.
    2. Fotos removidas: move linhas de `freight_order_photos` para `freight_order_edit_photos` (não apaga do storage).
    3. Novas fotos: upload em `freight-photos/{company}/{order}/edit-{uuid}.ext`, insere em `freight_order_photos`.
    4. Recalcula `freight_total = totalKg * novo pricePerKg`.
    5. UPDATE condicional (`edit_authorized=true`) setando novo preço/total, `edited_at/by`, `edit_authorized=false`.
    6. Rollback de storage se UPDATE retornar 0 linhas.
  - Notifica admins ("OFR #N editada por {freteiro}").

Reaproveita as defesas atuais (pré-check de status, validação de retorno, rollback de storage).

## Permissões / RLS

- `authorizeEdit`/`revoke` restritos a `admin` e `lider_frete` na UI e via política.
- `saveFreighterEdit`: RLS já restringe o freteiro à sua OFR. Adicionar guarda para exigir `edit_authorized=true` OR role admin/lider.
- Freteiro nunca edita itens, trajeto, doc principal, etc.

## Frontend

### `src/pages/FreightOrders.tsx`

- `TabKey` recebe `"edit"`. Ordem de abas para freteiro: `priority | open | in_progress | edit | completed | cancelled`. Para admin: mesma sequência, aba `edit` também visível (contagem para admin = OFRs com `edit_authorized=true`; para freteiro = suas OFRs autorizadas).
- Badge da aba `edit`: contagem em âmbar.
- Aba Finalizados:
  - Novo botão **"Autorizar edição"** (admin/lider) em cada card já finalizado quando `edit_authorized=false && edited_at is null` — ou "Autorizado ✓ (revogar)" quando pendente.
  - Ícone/badge **"Editada"** (Pencil âmbar) quando `edited_at != null`; tooltip com quem editou/quando.
- Aba `edit`:
  - Freteiro: lista OFRs autorizadas com botão grande "Editar OFR" abrindo modal específico.
  - Admin: espelha e permite revogar autorização.

### Novos modais

- `AuthorizeEditModal` — motivo (textarea opcional) + confirmar.
- `FreighterEditModal` — full-screen mobile:
  - `BrazilianWeightInput`-like para `pricePerKg`.
  - Grid de fotos atuais com botão "remover"; uploader para novas (limite 1–2 no total final).
  - Rodapé: "Salvar edição" + "Cancelar".
- `DetailsModal`: nova seção **"Histórico de Edição"** quando `edited_at`:
  - Preço: `R$ X → R$ Y` (usa `previous_price_per_kg`).
  - Total: idem.
  - Fotos antigas removidas: thumbnails via signed URL na aba "Fotos antigas".
  - Autor + timestamp da edição / autorização.

### PDF

- `freightOrderPdf.ts`: se `edited_at`, adiciona bloco "Editada em {data} por {nome}" logo abaixo da auditoria; opcional listar preço antes/depois. Não incluir fotos removidas.

## Regras críticas

1. Só uma edição pendente por vez — botão "Autorizar" oculto quando `edit_authorized=true`.
2. Edição do freteiro é atômica no cliente (rollback de storage e restauração de foto se falhar).
3. Snapshot preserva o valor original: se editar novamente, `previous_*` só é gravado se estava null (mantém referência ao último estado antes da 1ª edição). Alternativamente, cada edição sobrescreve — decidido: manter apenas comparativo entre último estado salvo e o novo (simplicidade).
4. Fotos removidas permanecem no storage e são referenciadas por `freight_order_edit_photos` para exibição histórica.
5. Notificações push reutilizam `send-push-notification` com `source: 'OFR'` e `ref_id/ref_number` para deduplicação.

## Documentação

Adicionar entrada em `docs/mestre.md` e atualizar `docs/FreightOrders.md` com o novo fluxo, aba, tabela e regras.

## Arquivos afetados

- `supabase/migrations/*` (nova migração schema + RLS + realtime).
- `src/hooks/useFreightOrders.ts` (novas mutations, query estendida).
- `src/pages/FreightOrders.tsx` (aba, botões, badges, novos modais).
- `src/lib/freightOrderPdf.ts` (bloco de edição).
- `docs/mestre.md`, `docs/FreightOrders.md`.

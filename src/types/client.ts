export interface Client {
  id: string;
  company_id: string;
  name: string;
  contact?: string;
  observations?: string;
  created_at: string;
}

export interface Article {
  id: string;
  company_id: string;
  name: string;
  client_id: string;
  client_name?: string;
  yarn_type_id?: string;
  weight_per_roll: number;
  value_per_kg: number;
  turns_per_roll: number;
  target_efficiency: number;
  observations?: string;
  created_at: string;
}

export interface ArticleMachineTurns {
  id: string;
  article_id: string;
  machine_id: string;
  company_id: string;
  turns_per_roll: number;
  observations?: string;
  created_at: string;
}

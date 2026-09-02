export type VercelRequest = {
  method?: string;
  body?: any;
  query: Record<string, string | string[] | undefined>;
};

export type VercelResponse = {
  status(code: number): VercelResponse;
  json(payload: unknown): VercelResponse;
};

export interface AIProviderConfig {
  apiKey?: string;
  model?: string;
  systemPrompt?: string;
}

export interface AIProviderResult {
  cases: any[];
  tokens?: number;
  suggestedSuite?: string;
}

export interface AIProvider {
  generateTestCases(input: string, config: AIProviderConfig): Promise<AIProviderResult>;
}

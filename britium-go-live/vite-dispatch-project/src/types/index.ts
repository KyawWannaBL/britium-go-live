export type TestStatus = 'NOT_RUN' | 'IN_PROGRESS' | 'PASS' | 'FAIL' | 'BLOCKED';

export interface TestCase {
  id: string;
  module: string;
  subModule?: string;
  scenario: string;
  preconditions: string;
  steps: string[];
  expectedResult: string;
  passCriteria: string;
  isCritical: boolean;
}

export interface TestResult {
  status: TestStatus;
  notes: string;
  defectRef: string;
  updatedAt: string;
  tester: string;
}

export interface TestRun {
  id: string;
  name: string;
  environment: string;
  tester: string;
  startedAt: string;
  results: Record<string, TestResult>;
}

export interface ModuleSummary {
  module: string;
  total: number;
  pass: number;
  fail: number;
  blocked: number;
  inProgress: number;
  notRun: number;
  criticalFail: number;
}

/**
 * ReportService — stub.
 *
 * The Report model and WalletLink model have been removed from the backend.
 * User reporting is an on-chain operation. This file is kept as a stub.
 */

export const REPORT_REASONS = [
  "malicious_code",
  "plagiarism",
  "fraud",
  "harassment",
  "spam",
  "other",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export interface IReportService {
  submit(input: {
    reporterId: string;
    reportedAddress: string;
    taskId?: string;
    reason: ReportReason;
    evidence: string;
  }): Promise<{ reportId: string }>;
  resolve(reportId: string, resolution: string): Promise<void>;
}

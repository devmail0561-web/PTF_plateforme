'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { Task } from '@/types/graphql';

interface TaskTemplateProps {
  task: Task;
}

function buildTemplate(task: Task): string {
  const lines: string[] = [
    `# Submission Template — ${task.title}`,
    ``,
    `## Task Info`,
    `- **ID:** ${task.id}`,
    `- **Type:** ${task.type}`,
    `- **Priority:** ${task.priority}`,
    `- **Duration:** ${task.duration}`,
    `- **Reward:** ${task.rewardMode === 'paid' ? `${task.rewardAmount} ${task.rewardToken ?? 'PTF'}` : 'Reputation only'}`,
    ``,
    `## Objective`,
    task.objective,
    ``,
    `## Deliverable`,
    task.deliverable,
    ``,
  ];

  if (task.outOfScope.length > 0) {
    lines.push(`## Out of Scope`);
    task.outOfScope.forEach((item) => lines.push(`- ${item}`));
    lines.push(``);
  }

  lines.push(`## Constraints`);
  lines.push(`- **Languages:** ${task.constraints.languages.join(', ')}`);
  lines.push(`- **Max files:** ${task.constraints.maxFiles}`);
  lines.push(`- **Max lines/file:** ${task.constraints.maxLinesPerFile}`);
  lines.push(`- **Max total lines:** ${task.constraints.maxTotalLines}`);
  lines.push(`- **Tests required:** ${task.constraints.requiredTests ? 'Yes' : 'No'}`);
  lines.push(`- **Min test coverage:** ${task.constraints.minTestCoverage}%`);
  if (task.constraints.forbiddenPatterns.length > 0) {
    lines.push(`- **Forbidden patterns:** ${task.constraints.forbiddenPatterns.join(', ')}`);
  }
  lines.push(``);

  if (task.verificationSteps.length > 0) {
    lines.push(`## Verification Steps`);
    task.verificationSteps.forEach((step, i) => {
      lines.push(`### Step ${i + 1} (${step.type})`);
      lines.push(`\`\`\`bash`);
      lines.push(step.command);
      lines.push(`\`\`\``);
      if (step.expectedOutput) {
        lines.push(`Expected output: \`${step.expectedOutput}\``);
      }
      if (step.threshold != null) {
        lines.push(`Threshold: ${step.threshold}%`);
      }
      lines.push(``);
    });
  }

  if (task.dependencies.length > 0) {
    lines.push(`## Dependencies`);
    task.dependencies.forEach((dep) => lines.push(`- ${dep}`));
    lines.push(``);
  }

  lines.push(`## Penalties`);
  lines.push(`| Violation | Credits | Reputation |`);
  lines.push(`|-----------|---------|------------|`);
  lines.push(`| Late delivery | ${task.punishments.lateDelivery.credits ?? '—'} | ${task.punishments.lateDelivery.reputation} |`);
  lines.push(`| Critical bug | ${task.punishments.criticalBug.credits ?? '—'} | ${task.punishments.criticalBug.reputation} |`);
  lines.push(`| Non-critical bug | ${task.punishments.nonCriticalBug.credits ?? '—'} | ${task.punishments.nonCriticalBug.reputation} |`);
  lines.push(`| Malicious code | ${task.punishments.maliciousCode.credits ?? '—'} | ${task.punishments.maliciousCode.reputation} |`);

  return lines.join('\n');
}

export function TaskTemplate({ task }: TaskTemplateProps) {
  const [copied, setCopied] = useState(false);

  const template = buildTemplate(task);

  async function handleCopy() {
    await navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([template], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `task-${task.id}-template.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-ptf-text-2 uppercase tracking-wide">
          Submission Template
        </h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </Button>
          <Button variant="secondary" size="sm" onClick={handleDownload}>
            Download .md
          </Button>
        </div>
      </div>
      <pre className="bg-ptf-bg border border-ptf-border rounded-lg p-4 overflow-x-auto text-xs font-mono text-ptf-text-2 whitespace-pre-wrap max-h-80 overflow-y-auto">
        {template}
      </pre>
    </Card>
  );
}

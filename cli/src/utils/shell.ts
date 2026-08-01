export function shellEscape(arg: string): string {
  return "'" + arg.replace(/'/g, "'\\''") + "'";
}

export function gitCmd(repoPath: string, args: string): string {
  return `git -C ${shellEscape(repoPath)} ${args}`;
}

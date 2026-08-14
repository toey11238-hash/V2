export function safeDiscordError(
  error: unknown,
  options: { fallback?: string; errorId?: string } = {},
): string {
  const fallback = options.fallback ?? 'ระบบไม่สามารถดำเนินการคำขอนี้ได้อย่างปลอดภัย โปรดลองใหม่หรือติดต่อผู้ดูแล';
  const raw = error instanceof Error ? error.message.trim() : '';
  const technicalCode = /^[A-Z][A-Z0-9_:-]{2,79}$/.test(raw) ? raw : undefined;
  const details = [
    fallback,
    technicalCode ? `รหัสเหตุผล: \`${technicalCode}\`` : undefined,
    options.errorId ? `รหัสอ้างอิง: \`${options.errorId}\`` : undefined,
  ].filter(Boolean);
  return details.join('\n');
}

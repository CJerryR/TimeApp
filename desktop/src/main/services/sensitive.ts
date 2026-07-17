export interface RedactionResult {
  text: string;
  redactions: string[];
}

const PATTERNS: Array<{ label: string; regex: RegExp; replacement: string }> = [
  { label: 'api_key', regex: /\b(?:sk|sk-ant|sk-proj|sk-or|ds)-[A-Za-z0-9_\-]{16,}\b/g, replacement: '[已隐藏密钥]' },
  { label: 'password', regex: /(密码|password|passcode|pwd)\s*[:：=]\s*\S+/gi, replacement: '$1：[已隐藏]' },
  { label: 'id_card_cn', regex: /\b\d{6}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]\b/g, replacement: '[已隐藏身份证号]' },
  { label: 'bank_card', regex: /\b(?:\d[ -]*?){16,19}\b/g, replacement: '[已隐藏银行卡号]' },
  { label: 'phone_cn', regex: /\b1[3-9]\d{9}\b/g, replacement: '[已隐藏手机号]' }
];

export function redactSensitive(input: string): RedactionResult {
  let text = input;
  const redactions = new Set<string>();
  for (const pattern of PATTERNS) {
    if (pattern.regex.test(text)) {
      redactions.add(pattern.label);
      text = text.replace(pattern.regex, pattern.replacement);
    }
    pattern.regex.lastIndex = 0;
  }
  return { text, redactions: [...redactions] };
}

export function hasStrongSensitive(input: string): boolean {
  return redactSensitive(input).redactions.some((item) => ['api_key', 'password', 'id_card_cn', 'bank_card'].includes(item));
}

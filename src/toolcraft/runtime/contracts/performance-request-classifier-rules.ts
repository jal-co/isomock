import type { ToolcraftPerformanceRequestReason } from "./performance-request-classifier-types";

type ClauseClassificationRule = Readonly<{
  patterns: readonly RegExp[];
  reason: ToolcraftPerformanceRequestReason;
}>;

export const englishRuntimeSubject =
  "(?:it|this|everything|app|application|editor|runtime|ui|interface|browser|input|controls?|buttons?|canvas|preview|renders?|rendering|uploads?|imports?|exports?|timeline|zoom|dragging|drag)";
export const russianRuntimeSubject =
  "(?:приложен(?:ие|ия)?|редактор|рантайм|интерфейс|браузер|ввод|контролы?|кнопк[а-я]*|канвас|превью|рендер|загрузк[а-я]*|импорт|экспорт|таймлайн|масштаб|перетаскиван[а-я]*|всё)";

const englishVerbNegator =
  "(?:does\\s+not|doesn['’]t|do\\s+not|don['’]t)";
const englishCopulaNegator =
  "(?:is\\s+not|isn['’]t|are\\s+not|aren['’]t|was\\s+not|wasn['’]t|were\\s+not|weren['’]t)";
const englishComplaintVerb = "(?:lag|stutter|freeze|hang)";
const englishComplaintState =
  "(?:slow|laggy|janky|frozen|freezing|hanging|delayed|unresponsive)";
const englishComplaintNoun =
  "(?:performance\\s+(?:issue|problem)s?|lag|jank|stutter|freez[\\p{L}]*|hang[\\p{L}]*|latency)";
const russianComplaintVerb =
  "(?:лагает|тормозит|фризит|зависает|зависло)";
const russianComplaintNoun =
  "(?:(?:проблем[\\p{L}]*\\s+с\\s+)?(?:производительн|лаг|тормоз|фриз|завис|задерж)[\\p{L}]*)";

function coordinatedNegationPattern(
  negator: string,
  complaint: string,
  conjunction: string,
): RegExp {
  return new RegExp(
    `(?:^|\\s)${negator}\\s+${complaint}(?:\\s+(?:${conjunction})\\s+(?:${negator}\\s+)?${complaint})*`,
    "giu",
  );
}

export const negatedComplaintSpanPatterns = [
  coordinatedNegationPattern(
    englishVerbNegator,
    englishComplaintVerb,
    "and|or",
  ),
  coordinatedNegationPattern(
    englishCopulaNegator,
    englishComplaintState,
    "and|or",
  ),
  coordinatedNegationPattern("(?:no|without)", englishComplaintNoun, "and|or"),
  coordinatedNegationPattern("(?:нет|без)", russianComplaintNoun, "и|или"),
  new RegExp(
    `(?:^|\\s)не\\s+${russianComplaintVerb}(?:\\s+(?:и|или)\\s+не\\s+${russianComplaintVerb})*`,
    "giu",
  ),
] as const;

export const explicitComplaintRules: readonly ClauseClassificationRule[] = [
  {
    reason: "resource-pressure-complaint",
    patterns: [
      /\b(?:high|heavy|excessive)\s+(?:cpu|gpu|memory|resource)(?:\s+(?:use|usage|pressure|load))?\b/iu,
      /\b(?:cpu|gpu|memory|resource)\s+(?:use|usage|pressure|load)\s+(?:is\s+)?(?:high|heavy|excessive)\b/iu,
      /(?:высок|чрезмерн|больш)[\p{L}]*.*(?:использ|расход|нагруз).*(?:памят|процессор|cpu|gpu|ресурс)/iu,
      /(?:памят|процессор|cpu|gpu|ресурс).*(?:использ|расход|нагруз).*(?:высок|чрезмерн|больш)/iu,
    ],
  },
  {
    reason: "strong-direct-complaint",
    patterns: [
      new RegExp(
        `\\b${englishRuntimeSubject}\\s+(?:(?:is|feels|keeps|gets|becomes|runs|renders|exports|works)\\s+)?(?:very\\s+)?(?:laggy|janky|frozen|freezing|hanging|delayed|unresponsive|slow)\\b`,
        "iu",
      ),
      new RegExp(
        `\\b${englishRuntimeSubject}\\s+(?:is\\s+)?not\\s+responsive\\b`,
        "iu",
      ),
      new RegExp(
        `\\b${englishRuntimeSubject}\\s+(?:lags?|stutters?|freezes?|hangs?)\\b`,
        "iu",
      ),
      /\b(?:interaction|dragging|drag|input|controls?)\s+(?:has|have|shows?|suffers?\s+from)\s+(?:noticeable\s+)?(?:delay|latency|lag)\b/iu,
      /\b(?:delay|latency|lag)\s+(?:during|when|while|on|after|under)\s+(?:interaction|dragging|drag|input|control\w*)\b/iu,
      /\bslow\s+(?:app|application|editor|browser|runtime|render|rendering|upload|import|export)\b/iu,
      /\bperformance\s+(?:is|feels|seems|became)?\s*(?:bad|poor|slow|low)\b/iu,
      /\b(?:lag|jank|stutter)\s+(?:during|when|while|on|after|under)\b/iu,
      /\b(?:laggy|janky|unresponsive)\b/iu,
      /\b(?:bad|poor)\s+responsiveness\b/iu,
      /\b(?:high|bad|poor|excessive)\s+latency\b|\blatency\s+(?:is\s+)?(?:high|bad|poor|excessive)\b/iu,
      /\b(?:low|unstable|dropping)\s+(?:fps|frame\s+rate)\b|\b(?:fps|frame\s+rate)\s+(?:is\s+)?(?:low|unstable|dropping|bad|poor)\b/iu,
      new RegExp(
        `${russianRuntimeSubject}\\s+(?:(?:работает|стал|остаётся|остается)\\s+)?(?:медленно|лагает|тормозит|фризит|зависает|зависло|не\\s+отвечает|не\\s+отзывчив[а-я]*)`,
        "iu",
      ),
      /(?:лагает|тормозит|фризит|зависает|зависло)(?:\s|[,.!?;]|$)/iu,
      /(?:лаг|тормоз|фриз|зависан|рывк)(?:и|ов|ами|ах)?\s+(?:при|во\s+время|после|на)/iu,
      /(?:медленно)\s+(?:работает|рендерит|экспортирует|отвечает|обновляется)/iu,
      /(?:медленн)[\p{L}]*\s+(?:приложен[\p{L}]*|редактор|рендер|загрузк[\p{L}]*|импорт|экспорт)/iu,
      /(?:плох|низк|медленн)[\p{L}]*\s+(?:перф|производительн|отклик|отзывчив)/iu,
      /(?:низк|нестабил|пада)[\p{L}]*\s+(?:фпс|fps|частот[\p{L}]*\s+кадр[\p{L}]*)/iu,
    ],
  },
  {
    reason: "software-optimization-request",
    patterns: [
      /\b(?:improve|optimize|optimise|fix|address|investigate|stabilize)\b.*\b(?:performance|responsiveness|latency|frame\s+rate|fps|cpu|gpu|memory|resource\s+(?:use|usage))\b/iu,
      /\b(?:performance|responsiveness|latency)\s+(?:optimization|optimisation|improvement|regression|issue|problem)\b/iu,
      /\b(?:improve|optimize|optimise|fix|address|investigate|stabilize)\b.*\b(?:app|application|editor|runtime|ui|interface|input|controls?|canvas|preview|render|rendering|upload|import|export)\b.*\b(?:faster|more\s+responsive|less\s+latency|lower\s+latency)\b/iu,
      /\breduce\b.*\b(?:latency|delay|cpu|gpu|memory|resource\s+(?:use|usage))\b/iu,
      /\bspeed\s+up\b.*\b(?:app|application|editor|runtime|ui|interface|controls?|canvas|preview|render|rendering|upload|import|export)\b/iu,
      /\bmake\b.*\b(?:app|application|editor|runtime|render|rendering|upload|import|export)\b.*\bfaster\b/iu,
      new RegExp(
        `\\b${englishRuntimeSubject}\\b.*\\b(?:should|must|needs?\\s+to)\\b.*\\b(?:faster|more\\s+responsive)\\b`,
        "iu",
      ),
      /(?:улучш|оптимиз|исправ|стабилиз).*(?:перф|производительн|отзывчив|отклик|задерж|фпс|частот[а-я]*\s+кадр[а-я]*|памят|процессор|cpu|gpu|ресурс)/iu,
      /(?:сниз|уменьш).*(?:задерж|нагруз|расход|использ).*(?:памят|процессор|cpu|gpu|ресурс)?/iu,
      /(?:улучш|оптимиз|исправ|стабилиз).*(?:приложен|редактор|рантайм|интерфейс|канвас|превью|рендер|загрузк|импорт|экспорт).*(?:быстр|отзывчив|меньш[а-я]*\s+задерж)/iu,
      /(?:ускор).*(?:приложен|редактор|рантайм|интерфейс|канвас|превью|рендер|экспорт)/iu,
      new RegExp(
        `${russianRuntimeSubject}.*(?:долж[а-я]*|нужно|надо).*(?:быстр|отзывчив)`,
        "iu",
      ),
    ],
  },
] as const;

export const productCommandRules: readonly ClauseClassificationRule[] = [
  {
    reason: "product-freeze-command",
    patterns: [
      /^\s*(?:please\s+)?freeze\s+(?:the\s+)?(?:camera|object|position|animation|motion|frame)\b/iu,
      /^\s*(?:add|apply|create|make)\b.*\b(?:freeze|frozen|freezing)\s+(?:effect|frame|state)\b/iu,
      /^\s*(?:замороз|зафиксир)[\p{L}]*.*(?:камер|объект|позиц|анимац|кадр)/iu,
      /(?:^|\s)фриз[-\s]?эффект(?:\s|$)/iu,
    ],
  },
  {
    reason: "product-speed-command",
    patterns: [
      /\b(?:make|let)\b.*\b(?:animation|motion|object|transition|playback)\b.*\b(?:faster|quicker)\b/iu,
      /\bincrease\b.*\b(?:animation|motion|playback)\b.*\bspeed\b/iu,
      /\b(?:move|animate)\b.*\bobject\b.*\b(?:faster|quicker)\b/iu,
      /\bspeed\s+up\b.*\b(?:animation|motion|transition|playback)\b/iu,
      /(?:сделай|пусть).*(?:анимац|движен|объект).*(?:быстр)/iu,
      /(?:увелич).*(?:скорост).*(?:анимац|движен)/iu,
      /(?:ускор).*(?:анимац|движен|переход|воспроизвед)/iu,
      /(?:двига|движет).*(?:объект).*(?:быстр)/iu,
    ],
  },
  {
    reason: "product-terminology-command",
    patterns: [
      /\b(?:rename|name|label)\b.*\b(?:performance|frozen|freeze|slow|fast|cpu|gpu|memory|fps|frame\s+rate)\b/iu,
      /\badd\b.*\b(?:label|legend|preset|mode|option|button)\b/iu,
      /\b(?:preset|mode|option|button)\b.*\b(?:named|called|label(?:ed)?)\b/iu,
      /(?:переимен|назва|подпис).*(?:перф|производительн|заморож|фриз|быстр|медлен|памят|процессор|cpu|gpu|фпс|кадр)/iu,
      /(?:добав).*(?:подпис|легенд|пресет|режим|опци|кнопк)/iu,
    ],
  },
  {
    reason: "generic-product-command",
    patterns: [
      /^\s*(?:please\s+)?(?:build|create|add|change|update|rename|remove|delete|implement|refactor)\b/iu,
      /^\s*(?:please\s+)?(?:improve|optimize|optimise|fix|address|investigate|stabilize)\b.*\b(?:architecture|structure|layout|copy|labels?|controls?|canvas|app|application|editor|runtime|ui|interface)\b/iu,
      /^\s*(?:пожалуйста[,\s]+)?(?:сделай|создай|добавь|измени|обнови|переименуй|удали|реализуй|отрефактори)\b/iu,
      /^(?:улучш|оптимиз|исправ|стабилиз).*(?:архитектур|структур|лейаут|текст|лейбл|контрол|канвас|приложен|редактор|рантайм|интерфейс)/iu,
    ],
  },
] as const;

function matchesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function matchPerformanceRequestRule(
  value: string,
  rules: readonly ClauseClassificationRule[],
): ToolcraftPerformanceRequestReason | null {
  return rules.find((rule) => matchesAny(value, rule.patterns))?.reason ?? null;
}

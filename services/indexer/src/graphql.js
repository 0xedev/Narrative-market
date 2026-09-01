const TOKEN_PATTERN = /"(?:[^"\\]|\\.)*"|\(|\)|\{|\}|,|:|\$[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_.]*|-?\d+/g;

function tokenize(source) {
  const tokens = [];
  let match;
  const pattern = new RegExp(TOKEN_PATTERN.source, "g");
  let position = 0;
  while ((match = pattern.exec(source)) !== null) {
    const token = { value: match[0], position: match.index };
    if (token.value.startsWith(" ") || token.value === "\n") continue;
    tokens.push(token);
    position = match.index + match[0].length;
  }
  return tokens;
}

function parseSelection(tokens, start) {
  const fields = [];
  let index = start;
  while (index < tokens.length && tokens[index].value !== "}") {
    const name = tokens[index].value;
    index += 1;
    if (tokens[index]?.value === "(") {
      const args = {};
      index += 1;
      while (tokens[index].value !== ")") {
        const argName = tokens[index].value;
        index += 1;
        if (tokens[index].value === ":") index += 1;
        const valueToken = tokens[index];
        if (valueToken.value === "{") {
          const nested = {};
          index += 1;
          while (tokens[index].value !== "}") {
            const key = tokens[index].value;
            index += 1;
            if (tokens[index].value === ":") index += 1;
            nested[key] = literalValue(tokens[index].value);
            index += 1;
            if (tokens[index].value === ",") index += 1;
          }
          index += 1;
          args[argName] = nested;
        } else {
          args[argName] = literalValue(valueToken.value);
          index += 1;
        }
        if (tokens[index]?.value === ",") index += 1;
      }
      index += 1;
      let selection = {};
      if (tokens[index]?.value === "{") {
        const parsed = parseSelection(tokens, index + 1);
        selection = parsed.fields;
        index = parsed.end + 1;
      }
      fields.push({ name, args, selection });
    } else if (tokens[index]?.value === "{") {
      const parsed = parseSelection(tokens, index + 1);
      fields.push({ name, args: {}, selection: parsed.fields });
      index = parsed.end + 1;
    } else {
      fields.push({ name, args: {}, selection: {} });
    }
  }
  return { fields, end: index };
}

function literalValue(raw) {
  if (raw.startsWith("\"")) return JSON.parse(raw);
  if (raw.startsWith("$")) return { variable: raw.slice(1) };
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10);
  return raw;
}

export function parseQuery(source) {
  const tokens = tokenize(source);
  let index = 0;
  while (index < tokens.length && tokens[index].value !== "{") index += 1;
  const { fields, end } = parseSelection(tokens, index + 1);
  return fields;
}

function resolveVariable(value, variables) {
  if (value && typeof value === "object" && value.variable !== undefined) {
    return variables?.[value.variable];
  }
  return value;
}

function resolveArgs(args, variables) {
  const resolved = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    if (key === "where" && value && typeof value === "object") {
      const where = {};
      for (const [filterKey, filterValue] of Object.entries(value)) {
        where[filterKey] = resolveVariable(filterValue, variables);
      }
      resolved.where = where;
    } else {
      resolved[key] = resolveVariable(value, variables);
    }
  }
  return resolved;
}

function bigIntToNumber(value) {
  if (value === null || value === undefined) return 0;
  try {
    return Number(BigInt(String(value)));
  } catch {
    return 0;
  }
}

function matchesWhere(entity, where) {
  for (const [key, expected] of Object.entries(where ?? {})) {
    if (expected === undefined || expected === null) continue;
    const actual = entity[key];
    if (actual === undefined) return false;
    const actualKey = typeof actual === "object" && actual !== null && "id" in actual ? actual.id : actual;
    if (String(actualKey).toLowerCase() !== String(expected).toLowerCase()) return false;
  }
  return true;
}

function sortEntities(entities, orderBy, direction) {
  if (!orderBy) return entities;
  const sorted = [...entities].sort((a, b) => {
    const av = bigIntToNumber(a[orderBy]);
    const bv = bigIntToNumber(b[orderBy]);
    return direction === "asc" ? av - bv : bv - av;
  });
  return sorted;
}

function projectEntity(entity, selection, ctx) {
  if (!entity) return null;
  const result = {};
  for (const field of selection ?? []) {
    const name = field.name;
    const value = entity[name];
    if (value === undefined) {
      result[name] = null;
    } else if (value === null) {
      result[name] = null;
    } else if (typeof value === "bigint") {
      result[name] = value.toString();
    } else if (typeof value === "object") {
      result[name] = projectEntity(value, field.selection, ctx);
    } else {
      result[name] = value;
    }
  }
  return result;
}

function hydrate(store) {
  const holders = new Map();
  for (const holder of store.holders.values()) {
    holders.set(holder.id, { ...holder });
  }
  const questions = new Map();
  for (const question of store.questions.values()) {
    questions.set(question.id, {
      ...question,
      currentHolder: question.currentHolder ? holders.get(question.currentHolder) ?? null : null,
      winningHolder: question.winningHolder
    });
  }
  const answers = new Map();
  for (const answer of store.answers.values()) {
    answers.set(answer.id, {
      ...answer,
      holder: holders.get(answer.holder) ?? null,
      question: questions.get(answer.question) ?? null
    });
  }
  for (const question of questions.values()) {
    question.currentAnswer = question.currentAnswer ? answers.get(question.currentAnswer) ?? null : null;
    question.winningAnswer = question.winningAnswer ? answers.get(question.winningAnswer) ?? null : null;
  }
  const takeovers = store.takeovers.map((takeover) => ({
    ...takeover,
    newHolder: holders.get(takeover.newHolder) ?? null,
    previousHolder: takeover.previousHolder ? holders.get(takeover.previousHolder) ?? null : null,
    answer: answers.get(takeover.answer) ?? null,
    question: questions.get(takeover.question) ?? null
  }));
  const payouts = store.payouts.map((payout) => ({
    ...payout,
    previousHolder: payout.previousHolder ? holders.get(payout.previousHolder) ?? null : null,
    question: questions.get(payout.question) ?? null
  }));
  const rewards = store.rewards.map((reward) => ({
    ...reward,
    holder: holders.get(reward.holder) ?? null,
    question: questions.get(reward.question) ?? null
  }));
  return { questions, answers, takeovers, payouts, rewards, proposals: store.proposals };
}

export function executeQuery(query, variables, store) {
  const fields = parseQuery(query);
  const graph = hydrate(store);
  const data = {};

  for (const field of fields) {
    const args = resolveArgs(field.args, variables);
    const collections = {
      questions: [...graph.questions.values()],
      answers: [...graph.answers.values()],
      takeovers: graph.takeovers,
      payouts: graph.payouts,
      rewards: graph.rewards,
      proposals: graph.proposals,
      holders: [...store.holders.values()]
    };
    let entities = collections[field.name] ?? [];
    entities = entities.filter((entity) => matchesWhere(entity, args.where));
    entities = sortEntities(entities, args.orderBy, args.orderDirection);
    if (typeof args.first === "number") entities = entities.slice(0, args.first);
    data[field.name] = entities.map((entity) => projectEntity(entity, field.selection, graph));
  }

  return { data };
}

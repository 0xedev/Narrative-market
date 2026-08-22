export type SubgraphQuestion = {
  id: string;
  uri: string;
  status: string;
  startsAt: string;
  endsAt: string;
  currentHolder?: { id: string } | null;
  currentAnswer?: { uri: string; hash: string } | null;
};

export type SubgraphTakeover = {
  id: string;
  price: string;
  timestamp: string;
  newHolder: { id: string };
  previousHolder?: { id: string } | null;
  answer: { uri: string; hash: string };
};

export type SubgraphHolder = {
  id: string;
  totalHeldSeconds: string;
  takeovers: string;
  wins: string;
  rewardsMinted: string;
};

export async function querySubgraph<T>(query: string, variables: Record<string, unknown> = {}) {
  const endpoint = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
  if (!endpoint) return null;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Subgraph request failed with ${response.status}`);
    const payload = await response.json() as { data?: T; errors?: Array<{ message: string }> };
    if (payload.errors?.length) throw new Error(payload.errors.map((error) => error.message).join(", "));
    return payload.data ?? null;
  } catch {
    return null;
  }
}

export const liveQuestionQuery = `
  query LiveQuestion {
    questions(where: { status: "ACTIVE" }, first: 1, orderBy: startsAt, orderDirection: desc) {
      id uri status startsAt endsAt
      currentHolder { id }
      currentAnswer { hash uri }
    }
  }
`;

export const activityQuery = `
  query Activity {
    takeovers(first: 6, orderBy: timestamp, orderDirection: desc) {
      id price timestamp
      newHolder { id }
      previousHolder { id }
      answer { hash uri }
    }
  }
`;

export const leaderboardQuery = `
  query Leaderboard {
    holders(first: 25, orderBy: totalHeldSeconds, orderDirection: desc) {
      id totalHeldSeconds takeovers wins rewardsMinted
    }
  }
`;

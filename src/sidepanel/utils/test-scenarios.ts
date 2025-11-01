// Test scenarios following TEST_SYSTEM.md specification

export interface TestStep {
  action:
    | "open"
    | "wait"
    | "close_all"
    | "check_popup"
    | "set_intent_age"
    | "trigger_nudges";
  url?: string;
  duration?: number;
  simulate?: {
    scroll?: { to: number; speed?: "slow" | "medium" | "fast" };
    dwellTime?: number;
    selectText?: Array<{ selector: string; index: number }>;
    hover?: Array<{ selector: string; duration: number }>;
  };
  intentIndex?: number;
  daysAgo?: number;
  expected?: string;
}

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  duration: string;
  expectedOutcome: string;
  steps: TestStep[];
  manualChecks: string[];
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    id: "react-learning",
    name: "📚 React Hooks Learning Session",
    description:
      "Simulates focused reading of React documentation with high engagement",
    duration: "~2 min",
    expectedOutcome:
      "1 active intent about React Hooks with 3 pages, confidence 70-90%",
    steps: [
      {
        action: "open",
        url: "https://react.dev/reference/react/hooks",
        duration: 15000,
        simulate: {
          scroll: { to: 90, speed: "slow" },
          dwellTime: 15000,
          selectText: [
            { selector: "h1", index: 0 },
            { selector: "code", index: 2 },
          ],
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://react.dev/reference/react/useState",
        duration: 18000,
        simulate: {
          scroll: { to: 85, speed: "medium" },
          dwellTime: 18000,
          selectText: [{ selector: "code", index: 0 }],
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://react.dev/reference/react/useEffect",
        duration: 20000,
        simulate: {
          scroll: { to: 95, speed: "slow" },
          dwellTime: 20000,
          selectText: [
            { selector: "h2", index: 1 },
            { selector: "code", index: 1 },
          ],
        },
      },
      { action: "wait", duration: 5000 },
      { action: "close_all" },
      {
        action: "check_popup",
        expected: "1 intent about React/Hooks with 3 pages, confidence 70-90%",
      },
    ],
    manualChecks: [
      "Open popup and check 'Active Intents' section",
      "Verify 1 intent exists with label mentioning 'React' or 'Hooks'",
      "Confirm page count is 3",
      "Check confidence is 70%+",
      "Verify status is 'Active'",
    ],
  },

  {
    id: "house-hunting",
    name: "🏠 House Hunting in Fremont",
    description: "Browses real estate sites for Fremont properties",
    duration: "~2 min",
    expectedOutcome:
      "1 intent about house hunting with 3 pages from different real estate sites",
    steps: [
      {
        action: "open",
        url: "https://www.zillow.com/fremont-ca/",
        duration: 12000,
        simulate: {
          scroll: { to: 70, speed: "medium" },
          dwellTime: 12000,
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://www.redfin.com/city/6770/CA/Fremont",
        duration: 15000,
        simulate: {
          scroll: { to: 65, speed: "medium" },
          dwellTime: 15000,
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://www.realtor.com/realestateandhomes-search/Fremont_CA",
        duration: 12000,
        simulate: {
          scroll: { to: 60, speed: "fast" },
          dwellTime: 12000,
        },
      },
      { action: "wait", duration: 5000 },
      { action: "close_all" },
      {
        action: "check_popup",
        expected: "1 intent about house hunting/real estate in Fremont",
      },
    ],
    manualChecks: [
      "Open popup and check intent label mentions 'house', 'home', or 'Fremont'",
      "Verify 3 pages from different real estate sites",
      "Check confidence is 75%+",
      "Verify domains include zillow.com, redfin.com, realtor.com",
    ],
  },

  {
    id: "parallel-intents",
    name: "🔀 Parallel Intents Test",
    description: "Alternates between React docs and tennis court searches",
    duration: "~2 min",
    expectedOutcome:
      "2 separate intents (React learning + Tennis courts/local)",
    steps: [
      {
        action: "open",
        url: "https://react.dev/learn",
        duration: 12000,
        simulate: {
          scroll: { to: 80, speed: "slow" },
          dwellTime: 12000,
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://www.google.com/search?q=tennis+courts+near+fremont+ca",
        duration: 10000,
        simulate: {
          scroll: { to: 60, speed: "medium" },
          dwellTime: 10000,
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://react.dev/reference/react",
        duration: 12000,
        simulate: {
          scroll: { to: 85, speed: "slow" },
          dwellTime: 12000,
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://www.yelp.com/search?find_desc=tennis+courts&find_loc=Fremont%2C+CA",
        duration: 10000,
        simulate: {
          scroll: { to: 55, speed: "medium" },
          dwellTime: 10000,
        },
      },
      { action: "wait", duration: 5000 },
      { action: "close_all" },
      {
        action: "check_popup",
        expected: "2 distinct intents (React + Tennis courts)",
      },
    ],
    manualChecks: [
      "Verify 2 separate intents exist",
      "Intent 1 should be about React/learning",
      "Intent 2 should be about Tennis courts/local search in Fremont",
      "NO merge suggestion (topics are unrelated)",
      "Each intent has 2 pages",
    ],
  },

  {
    id: "low-engagement",
    name: "👀 Low Engagement Test",
    description: "Quick visits to news sites with minimal interaction",
    duration: "~1 min",
    expectedOutcome:
      "May not create intent, or creates 'emerging' with low confidence",
    steps: [
      {
        action: "open",
        url: "https://news.ycombinator.com/",
        duration: 10000,
        simulate: {
          scroll: { to: 15, speed: "fast" },
          dwellTime: 10000,
        },
      },
      { action: "wait", duration: 500 },
      {
        action: "open",
        url: "https://www.reddit.com/",
        duration: 8000,
        simulate: {
          scroll: { to: 20, speed: "fast" },
          dwellTime: 8000,
        },
      },
      { action: "wait", duration: 500 },
      {
        action: "open",
        url: "https://twitter.com/",
        duration: 12000,
        simulate: {
          scroll: { to: 10, speed: "fast" },
          dwellTime: 12000,
        },
      },
      { action: "wait", duration: 3000 },
      { action: "close_all" },
      {
        action: "check_popup",
        expected: "Low/no intent creation due to minimal engagement",
      },
    ],
    manualChecks: [
      "Check if intent was created (may not be)",
      "If created, should have 'emerging' status",
      "Engagement scores should be < 0.3",
      "Verifies low engagement doesn't create strong intents",
    ],
  },

  {
    id: "nudge-generation",
    name: "🔔 Nudge Generation Test",
    description: "Creates dormant intent and triggers nudge generation",
    duration: "~2 min",
    expectedOutcome: "Nudge appears mentioning dormant activity",
    steps: [
      {
        action: "open",
        url: "https://react.dev/reference/react/hooks",
        duration: 15000,
        simulate: {
          scroll: { to: 90, speed: "slow" },
          dwellTime: 15000,
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://react.dev/learn/state-a-components-memory",
        duration: 12000,
        simulate: {
          scroll: { to: 80, speed: "medium" },
          dwellTime: 12000,
        },
      },
      { action: "wait", duration: 5000 },
      { action: "close_all" },
      { action: "wait", duration: 3000 },
      // Make intent 8 days old
      { action: "set_intent_age", intentIndex: 0, daysAgo: 8 },
      { action: "wait", duration: 2000 },
      // Trigger nudge generation
      { action: "trigger_nudges" },
      { action: "wait", duration: 3000 },
      {
        action: "check_popup",
        expected: "Nudge about dormant React learning activity",
      },
    ],
    manualChecks: [
      "Check 'Nudges' section in popup",
      "Nudge should exist mentioning dormant activity",
      "Should show evidence (pages visited)",
      "Should suggest resuming research",
      "Test nudge actions (Snooze, Follow, Dismiss)",
    ],
  },

  {
    id: "apple-edge-case",
    name: "🍎 Edge Case: Apple (Fruit vs Company)",
    description:
      "Tests semantic differentiation between Apple fruit and Apple Inc",
    duration: "~2 min",
    expectedOutcome: "2 separate intents for different Apple contexts",
    steps: [
      {
        action: "open",
        url: "https://en.wikipedia.org/wiki/Apple",
        duration: 12000,
        simulate: {
          scroll: { to: 70, speed: "medium" },
          dwellTime: 12000,
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://www.healthline.com/nutrition/10-health-benefits-of-apples",
        duration: 10000,
        simulate: {
          scroll: { to: 65, speed: "medium" },
          dwellTime: 10000,
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://www.apple.com/",
        duration: 10000,
        simulate: {
          scroll: { to: 60, speed: "fast" },
          dwellTime: 10000,
        },
      },
      { action: "wait", duration: 1000 },
      {
        action: "open",
        url: "https://finance.yahoo.com/quote/AAPL",
        duration: 12000,
        simulate: {
          scroll: { to: 70, speed: "medium" },
          dwellTime: 12000,
        },
      },
      { action: "wait", duration: 5000 },
      { action: "close_all" },
      {
        action: "check_popup",
        expected: "2 distinct intents (Apple fruit/health + Apple Inc/tech)",
      },
    ],
    manualChecks: [
      "Verify 2 separate intents exist",
      "Intent 1 should be about Apple fruit/nutrition/health",
      "Intent 2 should be about Apple Inc/technology/stock",
      "Despite keyword overlap, should NOT merge",
      "Entity extraction should show different entities",
    ],
  },
];

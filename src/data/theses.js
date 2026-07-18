export const leaderboardData = [
  { rank: 1, name: "Marcus Chen", handle: "@mchen", avatar: "MC", theses: 47, winRate: 81, avgReturn: 23.7, annualized: 38.2, avgHold: "187d", best: "NVDA · Long · +218%", bestRet: 218 },
  { rank: 2, name: "Priya Raghavan", handle: "@praghavan", avatar: "PR", theses: 38, winRate: 79, avgReturn: 21.4, annualized: 34.8, avgHold: "27d", best: "MRNA · Short · +94%", bestRet: 94 },
  { rank: 3, name: "James Holloway", handle: "@jholloway", avatar: "JH", theses: 52, winRate: 75, avgReturn: 19.8, annualized: 31.5, avgHold: "64d", best: "TSLA · Short · +67%", bestRet: 67 },
  { rank: 4, name: "Sofia Almeida", handle: "@salmeida", avatar: "SA", theses: 29, winRate: 83, avgReturn: 17.9, annualized: 29.4, avgHold: "241d", best: "LLY · Long · +142%", bestRet: 142 },
  { rank: 5, name: "Rafael Ortiz", handle: "@rortiz", avatar: "RO", theses: 44, winRate: 73, avgReturn: 16.2, annualized: 26.7, avgHold: "18d", best: "XOM · Long · +58%", bestRet: 58 },
  { rank: 6, name: "Yuki Tanaka", handle: "@ytanaka", avatar: "YT", theses: 31, winRate: 77, avgReturn: 15.8, annualized: 25.1, avgHold: "78d", best: "AMD · Long · +87%", bestRet: 87 },
  { rank: 7, name: "Anika Sharma", handle: "@asharma", avatar: "AS", theses: 26, winRate: 81, avgReturn: 14.6, annualized: 23.9, avgHold: "256d", best: "V · Long · +44%", bestRet: 44 },
  { rank: 8, name: "David Lindqvist", handle: "@dlindqvist", avatar: "DL", theses: 41, winRate: 71, avgReturn: 13.9, annualized: 22.3, avgHold: "45d", best: "SHOP · Short · +52%", bestRet: 52 },
  { rank: 9, name: "Fatima Al-Rashid", handle: "@falrashid", avatar: "FA", theses: 35, winRate: 74, avgReturn: 13.4, annualized: 21.8, avgHold: "219d", best: "OXY · Long · +71%", bestRet: 71 },
  { rank: 10, name: "Thomas Reilly", handle: "@treilly", avatar: "TR", theses: 48, winRate: 69, avgReturn: 12.8, annualized: 20.4, avgHold: "29d", best: "META · Long · +103%", bestRet: 103 },
  { rank: 11, name: "Mei Lin", handle: "@mlin", avatar: "ML", theses: 22, winRate: 82, avgReturn: 12.3, annualized: 19.7, avgHold: "84d", best: "COST · Long · +38%", bestRet: 38 },
  { rank: 12, name: "Andre Sokolov", handle: "@asokolov", avatar: "AS", theses: 33, winRate: 70, avgReturn: 11.9, annualized: 18.9, avgHold: "191d", best: "UBER · Long · +64%", bestRet: 64 },
  { rank: 13, name: "Caterina Bianchi", handle: "@cbianchi", avatar: "CB", theses: 27, winRate: 76, avgReturn: 11.6, annualized: 18.4, avgHold: "72d", best: "ENPH · Short · +48%", bestRet: 48 },
  // The "you" row. Identity fields (name/handle/avatar) are overlaid from the
  // signed-in account at render (see withIdentity); stats are replaced by the
  // user's real figures via rankedLeaderboard. Values here are inert fallbacks.
  { rank: 14, name: "You", handle: "", avatar: "—", theses: 0, winRate: 0, avgReturn: 0, annualized: 0, avgHold: "0d", best: "—", bestRet: 0, isYou: true },
  { rank: 15, name: "Rahul Mehta", handle: "@rmehta", avatar: "RM", theses: 39, winRate: 67, avgReturn: 10.9, annualized: 17.3, avgHold: "28d", best: "JPM · Long · +41%", bestRet: 41 }
];

export const sampleDiscover = [
  { author: "Marcus Chen", handle: "@mchen", title: "Nvidia: The AI Infrastructure Play Has Legs", ticker: "NVDA", side: "bull", sector: "Semiconductors", ret: 45.2, date: "Jan 12, 2024", snippet: "The market is still underestimating the recurring nature of CUDA ecosystem lock-in and the multi-year backlog..." },
  { author: "Priya Raghavan", handle: "@praghavan", title: "Moderna: Post-Covid Multiple Compression", ticker: "MRNA", side: "bear", sector: "Healthcare", ret: 32.1, date: "Dec 4, 2023", snippet: "The pipeline valuations are anchoring to peak COVID cash flows. Without accelerated oncology timelines, the floor is lower..." },
  { author: "James Holloway", handle: "@jholloway", title: "Tesla: Robotaxi Hopes vs. Margin Reality", ticker: "TSLA", side: "bear", sector: "Consumer", ret: 18.5, date: "Feb 20, 2024", snippet: "Pricing power in EVs has structurally shifted. The robotaxi narrative is masking deteriorating automotive gross margins..." },
  { author: "Sofia Almeida", handle: "@salmeida", title: "Eli Lilly: The Generational Compounder", ticker: "LLY", side: "bull", sector: "Healthcare", ret: 22.4, date: "Mar 1, 2024", snippet: "Mounjaro is not just a diabetes drug; it's a metabolic platform. The addressable market expansion into sleep apnea and cardiovascular..." }
];

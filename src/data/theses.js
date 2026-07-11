// ============ SAMPLE DATA ============
export const sampleTheses = [
  {
    id: 1, title: "ASML: The Monopoly Below the Surface", ticker: "ASML", company: "ASML Holding",
    side: "bull", sector: "Semiconductors", publishDate: "Mar 14, 2024", daysActive: 237,
    entry: 905.40, current: 1042.18, ret: 15.1, status: "active", updates: 3,
    triggers: [{ c: "Gross margin < 45%", s: "clear" }, { c: "China rev > 25%", s: "warning" }]
  },
  {
    id: 2, title: "Salesforce: The Multiple Compression Has Further to Run", ticker: "CRM", company: "Salesforce Inc.",
    side: "bear", sector: "Software", publishDate: "Jan 8, 2024", daysActive: 303,
    entry: 298.40, current: 273.20, ret: 8.4, status: "active", updates: 4,
    triggers: [{ c: "FCF margin > 35%", s: "clear" }, { c: "Revenue growth > 12%", s: "clear" }]
  },
  {
    id: 3, title: "CrowdStrike: Pricing Power in Security", ticker: "CRWD", company: "CrowdStrike Holdings",
    side: "bull", sector: "Cybersecurity", publishDate: "Apr 3, 2024", daysActive: 187,
    entry: 312.50, current: 383.40, ret: 22.7, status: "active", updates: 2,
    triggers: [{ c: "ARR growth < 25%", s: "clear" }, { c: "Gross margin < 70%", s: "clear" }]
  },
  {
    id: 4, title: "Chevron: Energy Transition Mispriced", ticker: "CVX", company: "Chevron Corporation",
    side: "bull", sector: "Energy", publishDate: "Feb 19, 2024", daysActive: 250,
    entry: 152.30, current: 161.80, ret: 6.2, status: "active", updates: 1,
    triggers: [{ c: "Dividend cut", s: "clear" }, { c: "Oil < $60/bbl", s: "clear" }]
  },
  {
    id: 5, title: "Snap: The Attention Recession", ticker: "SNAP", company: "Snap Inc.",
    side: "bear", sector: "Consumer", publishDate: "Dec 2, 2023", daysActive: 340,
    entry: 14.80, current: 11.20, ret: 24.3, status: "active", updates: 5,
    triggers: [{ c: "DAU growth < 2%", s: "breached" }, { c: "ARPU growth > 10%", s: "clear" }]
  },
  {
    id: 6, title: "Cintas: The Silent Compounder at Fair Value", ticker: "CTAS", company: "Cintas Corporation",
    side: "bull", sector: "Consumer", publishDate: "May 12, 2024", daysActive: 148,
    entry: 678.00, current: 707.20, ret: 4.3, status: "active", updates: 1,
    triggers: [{ c: "Gross margin < 45%", s: "clear" }]
  },
  {
    id: 7, title: "Nvidia: Pricing Out the Picks-and-Shovels Premium", ticker: "NVDA", company: "NVIDIA Corporation",
    side: "bull", sector: "Semiconductors", publishDate: "Aug 22, 2023", daysActive: 436,
    entry: 432.10, current: 887.40, ret: 105.3, status: "closed", closeDate: "Oct 15, 2024", updates: 6,
    triggers: [{ c: "Data center rev growth < 30%", s: "clear" }]
  }
];

export const leaderboardData = [
  { rank: 1, name: "Marcus Chen", handle: "@mchen", avatar: "MC", theses: 47, winRate: 81, avgReturn: 23.7, annualized: 38.2, avgHold: "187d", best: "NVDA · Long · +218%", bestRet: 218 },
  { rank: 2, name: "Priya Raghavan", handle: "@praghavan", avatar: "PR", theses: 38, winRate: 79, avgReturn: 21.4, annualized: 34.8, avgHold: "212d", best: "MRNA · Short · +94%", bestRet: 94 },
  { rank: 3, name: "James Holloway", handle: "@jholloway", avatar: "JH", theses: 52, winRate: 75, avgReturn: 19.8, annualized: 31.5, avgHold: "168d", best: "TSLA · Short · +67%", bestRet: 67 },
  { rank: 4, name: "Sofia Almeida", handle: "@salmeida", avatar: "SA", theses: 29, winRate: 83, avgReturn: 17.9, annualized: 29.4, avgHold: "241d", best: "LLY · Long · +142%", bestRet: 142 },
  { rank: 5, name: "Rafael Ortiz", handle: "@rortiz", avatar: "RO", theses: 44, winRate: 73, avgReturn: 16.2, annualized: 26.7, avgHold: "198d", best: "XOM · Long · +58%", bestRet: 58 },
  { rank: 6, name: "Yuki Tanaka", handle: "@ytanaka", avatar: "YT", theses: 31, winRate: 77, avgReturn: 15.8, annualized: 25.1, avgHold: "223d", best: "AMD · Long · +87%", bestRet: 87 },
  { rank: 7, name: "Anika Sharma", handle: "@asharma", avatar: "AS", theses: 26, winRate: 81, avgReturn: 14.6, annualized: 23.9, avgHold: "256d", best: "V · Long · +44%", bestRet: 44 },
  { rank: 8, name: "David Lindqvist", handle: "@dlindqvist", avatar: "DL", theses: 41, winRate: 71, avgReturn: 13.9, annualized: 22.3, avgHold: "174d", best: "SHOP · Short · +52%", bestRet: 52 },
  { rank: 9, name: "Fatima Al-Rashid", handle: "@falrashid", avatar: "FA", theses: 35, winRate: 74, avgReturn: 13.4, annualized: 21.8, avgHold: "219d", best: "OXY · Long · +71%", bestRet: 71 },
  { rank: 10, name: "Thomas Reilly", handle: "@treilly", avatar: "TR", theses: 48, winRate: 69, avgReturn: 12.8, annualized: 20.4, avgHold: "162d", best: "META · Long · +103%", bestRet: 103 },
  { rank: 11, name: "Mei Lin", handle: "@mlin", avatar: "ML", theses: 22, winRate: 82, avgReturn: 12.3, annualized: 19.7, avgHold: "278d", best: "COST · Long · +38%", bestRet: 38 },
  { rank: 12, name: "Andre Sokolov", handle: "@asokolov", avatar: "AS", theses: 33, winRate: 70, avgReturn: 11.9, annualized: 18.9, avgHold: "191d", best: "UBER · Long · +64%", bestRet: 64 },
  { rank: 13, name: "Caterina Bianchi", handle: "@cbianchi", avatar: "CB", theses: 27, winRate: 76, avgReturn: 11.6, annualized: 18.4, avgHold: "234d", best: "ENPH · Short · +48%", bestRet: 48 },
  { rank: 14, name: "Elena Vance", handle: "@evance", avatar: "EV", theses: 12, winRate: 71, avgReturn: 11.4, annualized: 19.8, avgHold: "214d", best: "NVDA · Long · +105%", bestRet: 105, isYou: true },
  { rank: 15, name: "Rahul Mehta", handle: "@rmehta", avatar: "RM", theses: 39, winRate: 67, avgReturn: 10.9, annualized: 17.3, avgHold: "178d", best: "JPM · Long · +41%", bestRet: 41 }
];

export const sampleDrafts = [
  { id: 1, title: "Eli Lilly: The GLP-1 Moat is Deeper Than Priced", ticker: "LLY", side: "bull", lastEdited: "2 hours ago", wordCount: 1840, triggersCount: 2 },
  { id: 2, title: "Tesla: FSD Monetization Timelines are Delusional", ticker: "TSLA", side: "bear", lastEdited: "3 days ago", wordCount: 920, triggersCount: 1 },
  { id: 3, title: "Dollar General: The Rural Squeeze", ticker: "DG", side: "bear", lastEdited: "1 week ago", wordCount: 2100, triggersCount: 3 }
];

export const sampleDiscover = [
  { author: "Marcus Chen", handle: "@mchen", title: "Nvidia: The AI Infrastructure Play Has Legs", ticker: "NVDA", side: "bull", ret: 45.2, date: "Jan 12, 2024", snippet: "The market is still underestimating the recurring nature of CUDA ecosystem lock-in and the multi-year backlog..." },
  { author: "Priya Raghavan", handle: "@praghavan", title: "Moderna: Post-Covid Multiple Compression", ticker: "MRNA", side: "bear", ret: 32.1, date: "Dec 4, 2023", snippet: "The pipeline valuations are anchoring to peak COVID cash flows. Without accelerated oncology timelines, the floor is lower..." },
  { author: "James Holloway", handle: "@jholloway", title: "Tesla: Robotaxi Hopes vs. Margin Reality", ticker: "TSLA", side: "bear", ret: 18.5, date: "Feb 20, 2024", snippet: "Pricing power in EVs has structurally shifted. The robotaxi narrative is masking deteriorating automotive gross margins..." },
  { author: "Sofia Almeida", handle: "@salmeida", title: "Eli Lilly: The Generational Compounder", ticker: "LLY", side: "bull", ret: 22.4, date: "Mar 1, 2024", snippet: "Mounjaro is not just a diabetes drug; it's a metabolic platform. The addressable market expansion into sleep apnea and cardiovascular..." }
];

Web app for investors to write, publish, and track investment theses with built-in accountability. The core mechanic is that performance is tracked from the moment a thesis is published (or a user-set future date that cannot be changed), and theses cannot be deleted to prevent skewing stats.
Thesis Creation

Rich text editor (Notion-like) for writing the thesis
Support dragging in Word files with auto-formatting
In-browser Excel/model viewer
Ability to embed financials, charts, and supporting data
Bull or bear toggle (long or short position declaration)
Define "thesis invalidation triggers" — conditions that would break the thesis (e.g. "if gross margin falls below 40%"), which the app monitors and flags automatically
Save as draft before publishing

Publishing & Performance Tracking

On publish, timestamp is locked and entry price is recorded automatically — cannot be backdated
Post-publish page shows a price chart with entry point marked and total return since publication date
Thesis versioning — users can append timestamped updates (e.g. "Update #1: Q3 earnings confirmed the margin thesis") to keep it as a living document
Option to manually close a thesis, or set a future close date that cannot be changed
App flags when invalidation trigger conditions are met

Social & Leaderboard

Public leaderboard ranked by average % return, with filters for long/short, holding period, sector
Public user profiles showing: win rate, average return, annualized return, number of theses, average holding period
Leaderboard is integrity-protected — no deletions allowed, timestamps are system-generated

Design

Clean, minimal, white and gray color scheme

Frontend: Next.js + Tailwind CSS
Charts: TradingView Lightweight Charts
Backend: Next.js API Routes
Database: PostgreSQL via Supabase
Auth: Supabase Auth with Google login
Market data: Polygon.io
Rich text editor: Tiptap
Hosting: Vercel

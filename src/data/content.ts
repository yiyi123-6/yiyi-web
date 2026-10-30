/**
 * ♡ YIYI'S UNIVERSE — CENTRAL CONTENT FILE ♡
 *
 * Almost every word, link, number and photo on the site lives here.
 * Anything wrapped in [square brackets] is a placeholder waiting for real info.
 * Hikes & dream adventures live in ./hikes.json.
 *
 * Photos: drop files into /public/images and reference them as 'images/your-file.jpg'
 * (no leading slash — the site adds the GitHub Pages base path for you).
 * Leave `src` empty ('') to show a pretty illustrated placeholder instead.
 */

export type Photo = { src: string; alt: string; caption?: string }

export const site = {
  name: 'Yiyi',
  title: "Yiyi's Universe",
  tagline: 'Data, Dumbbells & Big Dreams.',
  headline: "Hi, I'm Yiyi. I build models, lift weights, and chase mountains.",
  intro: "Senior Data Scientist by profession. Adventurer by nature. Founder at heart. Forever curious about what's next.",
  location: '[Your city], [Country]',
  currently: 'Currently climbing mountains and occasionally corporate ladders.',
}

export const links = {
  email: 'yiyitan076@gmail.com',
  /**
   * Your Google Apps Script web-app URL (see scripts/invite-relay.gs). Invites are then sent
   * from your Gmail to your Gmail. While '' the form opens the visitor's email app instead.
   */
  inviteScriptUrl: '',
  linkedin: 'https://www.linkedin.com/in/yiyitan',
  instagram: 'https://www.instagram.com/yosoy.ee/',
  instagramHandle: '@yosoy.ee',
  strava: 'https://strava.app.link/v8c5LpDF8Mb',
  github: 'https://github.com/your-handle', // ✎
  resume: '', // ✎ optional: 'files/resume.pdf' in /public/files — leave '' to hide
}

/** Theme song that starts on the visitor's first tap/click (browsers block sound before that). */
export const music = {
  title: "Life's What You Make It",
  artist: 'Hannah Montana',
  youtubeId: 'j-gwZgEgwq8', // official "Hannah Montana - Topic" audio
  volume: 35, // 0–100
}

/** Real photos (from Instagram). Files live in /public/images/instagram. */
export const photos = {
  profile: { src: 'images/instagram/profile.webp', alt: 'Yiyi smiling in headphones' },
  hero: { src: 'images/instagram/horseshoe-bend-1.webp', alt: 'Yiyi at Horseshoe Bend, Arizona' },
  /** Photo dump shown on the About page. */
  gallery: [
    { src: 'images/instagram/seattle-cherry-blossom-1.webp', alt: 'Yiyi under cherry blossoms in Seattle', caption: 'miss the cherry blossoms in Seattle' },
    { src: 'images/instagram/horseshoe-bend-3.webp', alt: 'Yiyi sitting on the rim of Horseshoe Bend', caption: '#horseshoebend' },
    { src: 'images/instagram/campus-1.webp', alt: 'Yiyi in a polka-dot dress by a tall window', caption: '🏫' },
    { src: 'images/instagram/niagara-2.webp', alt: 'Yiyi on rocks above the turquoise Niagara River', caption: '#niagarafallscanada' },
    { src: 'images/instagram/las-vegas-1.webp', alt: 'Yiyi on the Las Vegas strip', caption: '#lasvegas' },
    { src: 'images/instagram/la-jolla-1.webp', alt: 'Yiyi in red at Cabrillo National Monument', caption: 'red fit, blue sky' },
    { src: 'images/instagram/los-angeles-1.webp', alt: 'Yiyi looking out at the Hollywood sign', caption: '#losangeles' },
    { src: 'images/instagram/campus-3.webp', alt: 'Yiyi walking up a wooden staircase', caption: 'main character stairs' },
    { src: 'images/instagram/la-jolla-3.webp', alt: 'Yiyi on a bench overlooking the Pacific', caption: '#lajollacove' },
    { src: 'images/instagram/los-angeles-2.webp', alt: 'Yiyi on a giant red sofa', caption: 'sit down, it’s a big one' },
    { src: 'images/instagram/seattle-cherry-blossom-2.webp', alt: 'Yiyi and a friend among cherry blossoms', caption: 'blossom season' },
    { src: 'images/instagram/niagara-1.webp', alt: 'Yiyi above the Niagara gorge', caption: 'that colour is real' },
    { src: 'images/instagram/campus-2.webp', alt: 'Yiyi on a staircase under a domed ceiling', caption: 'look up' },
    { src: 'images/instagram/los-angeles-3.webp', alt: 'Yiyi by the Angels Flight railway', caption: 'angels flight' },
    { src: 'images/instagram/las-vegas-2.webp', alt: 'The Welcome to Fabulous Las Vegas sign at night', caption: 'fabulous, obviously' },
    { src: 'images/instagram/beach-sunset.webp', alt: 'Yiyi walking on a beach at sunset', caption: '🏖️+🌅' },
  ] as Photo[],
}

/* ───────────────────────────── 🧠 BRAIN ───────────────────────────── */

export const brain = {
  intro:
    'I turn messy data into decisions. My favourite problems sit where statistics, product intuition and a healthy amount of curiosity meet.',
  role: 'Senior Data Scientist',
  focusAreas: [
    { title: 'Machine Learning', blurb: 'Models that earn their place in production — interpretable when it matters, ambitious when it counts.', emoji: '🤖' },
    { title: 'Experimentation & A/B Testing', blurb: 'Designing tests that answer the real question, and having the patience to read them honestly.', emoji: '🧪' },
    { title: 'Personalization & Recsys', blurb: 'Helping the right thing find the right person at the right moment.', emoji: '🎯' },
    { title: 'Data Products', blurb: 'From notebook to something people actually use every day.', emoji: '📦' },
    { title: 'Applied AI', blurb: 'Using LLMs and modern ML pragmatically — where they genuinely help.', emoji: '✨' },
    { title: 'Product Thinking', blurb: 'Starting with “what decision will this change?” before writing a single line of SQL.', emoji: '💡' },
  ],
  skills: [
    'Python', 'SQL', 'R', 'Java', 'JavaScript', 'GCP', 'Azure', 'Databricks', 'Spark', 'Hadoop',
    'XGBoost', 'Neural networks', 'NLP', 'LLMs', 'Computer vision', 'A/B testing', 'Customer segmentation',
    'Feature engineering', 'Tableau', 'Looker Studio',
  ],
  projects: [
    {
      org: 'Canadian Tire',
      title: 'A/B testing & segmentation on autopilot',
      blurb: 'Production code that automates A/B testing and customer segmentation pipelines, fed by ETL on raw customer log data in Hive/GCP.',
      tags: ['A/B testing', 'Segmentation', 'Python', 'GCP'],
      impact: '−60% manual processing time',
      link: '', // optional GitHub / write-up URL
    },
    {
      org: 'Canadian Tire',
      title: 'Predicting what customers do next',
      blurb: 'Machine learning (hi, XGBoost) on customer traits to predict behaviour, so marketing campaigns reach the right people.',
      tags: ['XGBoost', 'Prediction', 'Marketing'],
      impact: '$1.4M incremental omnichannel sales lift · 5× ROI on a coffee campaign',
      link: '',
    },
    {
      org: 'TD Bank',
      title: 'Regulatory NLP & audit automation',
      blurb: 'An NLP system that transforms regulatory data to meet Sarbanes–Oxley (SOX) requirements using 11+ methods, plus SQL that turned piles of raw audit data into an automated audit process.',
      tags: ['NLP', 'SQL', 'Web scraping'],
      impact: '−30% audit turnaround time',
      link: '',
    },
  ],
  /** Career quest log, newest first. Leave `org` '' to show just the role. */
  experience: [
    { role: 'Senior Data Scientist', org: 'Homebase', when: '2026 – now', blurb: 'The current chapter: designing end-to-end machine learning systems.' },
    { role: 'Data Scientist', org: 'Canadian Tire', when: 'May 2023 – Jul 2025', blurb: 'Production ML for A/B testing, customer segmentation and marketing campaigns.' },
    { role: 'Data Science & Advanced Analytics', org: 'TD Bank', when: 'Jan – Apr 2023', blurb: 'NLP, web scraping and SQL to automate auditing and regulatory work.' },
    { role: 'Data Engineer', org: 'HUAWEI Technologies', when: 'May – Dec 2021', blurb: 'Python clean-up of hundreds of Excel files (+25% efficiency), then a migration to SQL Server.' },
  ],
  achievements: [
    'Master in Computer Science — Georgia Institute of Technology (2024)',
    'HBSc, Double Major in Computer Science & Mathematics, Minor in Statistics — University of Toronto (2022)',
    '4+ years designing end-to-end machine learning systems',
  ],
}

/* ───────────────────────────── 💪 GYM ───────────────────────────── */

export const gym = {
  quotes: ['Some girls collect shoes. I collect PRs.', 'Strong body. Curious brain. Unreasonable ambition.'],
  interests: ['Weightlifting', 'Strength training', 'Pull-ups', 'Stair climber workouts', 'Boxing', 'Gymnastics', 'Snowboarding', 'Running', 'Progressive overload'],
  /** Gym photos from Instagram — captions are the original post captions. */
  photos: [
    { src: 'images/instagram/gym-pullup-progress.webp', alt: 'Yiyi doing pull-ups at the gym', caption: 'Pull up progress report ✍🏻' },
    { src: 'images/instagram/gym-pullup-back-day.webp', alt: 'Yiyi attempting pull-ups after back day', caption: 'pull-ups right after back day lol 🤪' },
    { src: 'images/instagram/gym-reels.webp', alt: 'Yiyi post-workout selfie', caption: '#gymreels' },
    { src: 'images/instagram/post-workout-eats.webp', alt: 'Yiyi eating after a workout', caption: 'post workout eat with me' },
  ] as Photo[],
  /** Score to beat in the 10-second "Beat My Reps" game. ✎ set your own! */
  myRepRecord: 42,
  /** Personal records. Set `value` to '' to show “to be announced”. */
  prs: [
    { lift: 'Deadlift', value: '', unit: 'kg' },
    { lift: 'Squat', value: '', unit: 'kg' },
    { lift: 'Bench press', value: '', unit: 'kg' },
    { lift: 'Hip thrust', value: '', unit: 'kg' },
    { lift: 'Longest stair climber session', value: '', unit: 'min' },
  ],
  /** Progress chart — SAMPLE numbers, replace with your own (any lift, any unit). */
  progress: {
    label: 'Deadlift (sample data — edit me)',
    unit: 'kg',
    points: [
      { label: 'Jan', value: 60 },
      { label: 'Feb', value: 65 },
      { label: 'Mar', value: 67.5 },
      { label: 'Apr', value: 72.5 },
      { label: 'May', value: 75 },
      { label: 'Jun', value: 80 },
      { label: 'Jul', value: 82.5 },
      { label: 'Aug', value: 87.5 },
    ],
  },
  /** Weekly training log — SAMPLE. */
  week: [
    { day: 'Mon', workout: 'Lower body', done: true },
    { day: 'Tue', workout: 'Stair climber', done: true },
    { day: 'Wed', workout: 'Upper body', done: true },
    { day: 'Thu', workout: 'Rest & stretch', done: false },
    { day: 'Fri', workout: 'Full body', done: true },
    { day: 'Sat', workout: 'Hike!', done: false },
    { day: 'Sun', workout: 'Rest', done: false },
  ],
  milestones: [
    { title: 'First pull-up', unlocked: false, emoji: '🧗‍♀️' },
    { title: 'Bodyweight deadlift', unlocked: false, emoji: '🏋️‍♀️' },
    { title: '100 workouts logged', unlocked: false, emoji: '💯' },
    { title: '60-min stair climber', unlocked: false, emoji: '🪜' },
    { title: '[Your milestone]', unlocked: false, emoji: '🏆' },
    { title: '[Your milestone]', unlocked: false, emoji: '🎀' },
  ],
}

/* ───────────────────────────── 🚀 FOUNDER ───────────────────────────── */

export const founder = {
  company: 'LunchMe',
  quote: "I'd rather try something ambitious and learn than spend my life wondering what if.",
  facts: [
    { label: 'Founded', value: '[Year]' },
    { label: 'Role', value: '[Founder / CEO / …]' },
    { label: 'What it did', value: '[One sentence about LunchMe]' },
    { label: 'Where', value: '[City]' },
  ],
  /** The interactive journey. Replace the bracketed text with your story. */
  chapters: [
    {
      id: 'idea',
      title: 'The Original Idea',
      emoji: '💡',
      sticky: 'it started with lunch…',
      body: '[What was the spark? Describe the moment the idea for LunchMe first showed up.]',
      photo: { src: '', alt: 'An early LunchMe sketch', caption: 'napkin sketch #1' },
    },
    {
      id: 'why',
      title: 'The Motivation',
      emoji: '❤️‍🔥',
      sticky: 'why me? why now?',
      body: '[Why did this problem matter to you enough to start a company?]',
      photo: { src: '', alt: 'The LunchMe founding moment', caption: 'day one energy' },
    },
    {
      id: 'build',
      title: 'Building & Experimenting',
      emoji: '🛠️',
      sticky: 'ship it, learn, repeat',
      body: '[How did you build the first version? What experiments did you run?]',
      photo: { src: '', alt: 'LunchMe prototype', caption: 'prototype v0.1' },
    },
    {
      id: 'pivot',
      title: 'Challenges & Pivots',
      emoji: '🌪️',
      sticky: 'plot twist!',
      body: '[What got hard? What did you change your mind about?]',
      photo: { src: '', alt: 'Whiteboard of LunchMe pivots', caption: 'the whiteboard of doom' },
    },
    {
      id: 'learned',
      title: 'What I Learned',
      emoji: '📚',
      sticky: 'lessons, not regrets',
      body: '[The biggest lessons from your founder era.]',
      photo: { src: '', alt: 'LunchMe team or workspace', caption: 'the people & the place' },
    },
    {
      id: 'changed',
      title: 'How It Changed Me',
      emoji: '🦋',
      sticky: 'founder brain = forever',
      body: '[How does being a founder shape the way you work as a data scientist today?]',
      photo: { src: '', alt: 'Yiyi today', caption: 'still building' },
    },
  ],
}

/* ───────────────────────────── 🎮 ABOUT ───────────────────────────── */

export const about = {
  characterClass: 'Data Scientist / Adventurer / Builder',
  level: 99, // playful
  stats: [
    { name: 'Curiosity', value: 98 },
    { name: 'Strength', value: 86 },
    { name: 'Stamina', value: 90 },
    { name: 'Pattern-finding', value: 95 },
    { name: 'Cheekiness', value: 77 },
  ],
  abilities: [
    'Finding patterns in chaos',
    'Lifting heavy things',
    'Making ambitious plans',
    'Exploring unfamiliar places',
    'Turning curiosity into projects',
  ],
  weaknesses: ['To be filled in later'],
  sideQuests: ['Exploring new mountains', 'Getting stronger', 'Building interesting things', 'Learning something unexpected'],
  /** "Things You Won't Find on My Résumé" — ✎ make these 100% you. */
  notOnResume: [
    { emoji: '🐱', title: 'My pets have their own Instagram', body: 'Meet my cat & dog over at @xiangx.jingx. They have more fans than I do.' },
    { emoji: '🏂', title: 'Multi-sport menace', body: 'Boxing, gymnastics, snowboarding, running, lifting. Find my runs on Strava.' },
    { emoji: '🎧', title: 'Gym anthem: Stronger by Kanye West', body: "Work it, make it, do it, makes us harder, better, faster… stronger. Guaranteed PR.", youtubeId: 'PsO6ZnUZI0g' },
    { emoji: '📍', title: 'Next place on the map', body: 'Somewhere warm~ ☀️ Sunshine, ocean, zero snow shovels. Suggestions welcome.' },
    { emoji: '☕', title: 'My order', body: 'Decaf latte with oat milk. All the cozy, none of the 3am thoughts.' },
    { emoji: '📖', title: 'The book that rewired me', body: 'The Courage to Be Disliked. Turns out freedom starts with not needing everyone to like you.' },
  ],
  /** Shown by the hidden “Plot Twist” button. */
  funFacts: [
    "Plot twist: I always have way too many browser tabs open. Always.",
    'Plot twist: every model I train gets a secret nickname.',
    'Plot twist: I think a good summit snack is a valid optimisation objective.',
    "Plot twist: the stair climber and I are in a long-term relationship. It's complicated.",
    '[Add your own real fun fact here]',
  ],
  secretMessage:
    "You found the secret! ♡ Thanks for exploring this far — that kind of curiosity is exactly my type of person. Say hi and tell me you found the heart.",
}

/* ───────────────────────────── 💌 CONNECT ───────────────────────────── */

export const connect = {
  options: [
    {
      id: 'ai',
      label: "Let's talk AI & Data",
      emoji: '🧠',
      subject: "Let's talk AI & data",
      message:
        "Hi Yiyi! I came across your universe and loved the Tiny AI lab. I'm working on [a data/AI problem] and would love to swap notes on [experimentation / recommendations / applied AI]. Up for a chat?",
    },
    {
      id: 'build',
      label: "Let's build something",
      emoji: '🛠️',
      subject: "Let's build something together",
      message:
        "Hi Yiyi! I have an idea that needs a data brain and founder energy: [your idea in one line]. Would you be open to a quick call to see if we should build it together?",
    },
    {
      id: 'hike',
      label: "Let's go hiking",
      emoji: '🏔️',
      subject: 'Next summit?',
      message:
        "Hi Yiyi! Your Summit Quest gave me serious trail envy. I know a great route near [place] — want to plan a hike? I'll bring the snacks.",
    },
    {
      id: 'startup',
      label: "Let's talk startups",
      emoji: '🚀',
      subject: 'Founder to founder',
      message:
        "Hi Yiyi! I loved reading about your LunchMe chapter. I'm [building / thinking about building] [something] and would love to hear what you learned along the way.",
    },
    {
      id: 'hi',
      label: 'Just saying hi!',
      emoji: '👋',
      subject: 'Hi from your universe ♡',
      message: "Hi Yiyi! Just wandered through your universe and wanted to say it made my day. Keep lifting, climbing and building! ♡",
    },
  ],
}

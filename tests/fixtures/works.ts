import type { Work } from '../../lib/library/model';
// Fictional titles for the isolated test database only. Never loaded by the app.
const rows: [Work['type'], string, number, string[]][] = [
  [
    "movies",
    "The Paper Observatory",
    2014,
    [
      "Comedy",
      "Drama"
    ]
  ],
  [
    "movies",
    "Echoes of Tomorrow",
    2004,
    [
      "Drama",
      "Romance",
      "Science Fiction"
    ]
  ],
  [
    "movies",
    "Midnight Matinee",
    2016,
    [
      "Comedy",
      "Drama",
      "Romance"
    ]
  ],
  [
    "anime",
    "Orbit Couriers",
    1998,
    [
      "Action",
      "Adventure",
      "Drama",
      "Science Fiction"
    ]
  ],
  [
    "anime",
    "First Bell",
    2000,
    [
      "Comedy",
      "Drama",
      "Sports"
    ]
  ],
  [
    "anime",
    "Astral Dispatch",
    2014,
    [
      "Action",
      "Adventure",
      "Supernatural"
    ]
  ],
  [
    "games",
    "Ember Circuit",
    2025,
    [
      "Action",
      "Indie",
      "RPG"
    ]
  ],
  [
    "games",
    "City of Wolves",
    2013,
    [
      "Action",
      "Adventure"
    ]
  ],
  [
    "games",
    "Clockwork Garden",
    2014,
    [
      "Action"
    ]
  ]
];
export const suggestions: Work[] = rows.map(([type,title,year,genres], index) => ({ id: `manual:fixture:${index}`,type,title,year,genres,poster:'/library/test-poster.svg',episodes:null,seasons:null,summary:'',provider:'manual',providerId:'',sourceUrl:'' }));

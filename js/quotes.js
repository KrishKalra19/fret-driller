// Quote of the day from films, TV and books; the same quote for everyone on a given date.
(() => {
  const QUOTES = [
    // Animated films
    { q: "Yesterday is history, tomorrow is a mystery, but today is a gift. That is why it is called the present.", who: 'Master Oogway', src: 'Kung Fu Panda', year: 2008 },
    { q: "There is no secret ingredient. It's just you.", who: 'Po', src: 'Kung Fu Panda', year: 2008 },
    { q: 'There are no accidents.', who: 'Master Oogway', src: 'Kung Fu Panda', year: 2008 },
    { q: "Your story may not have such a happy beginning, but that doesn't make you who you are. It is the rest of your story, who you choose to be.", who: 'The Soothsayer', src: 'Kung Fu Panda 2', year: 2011 },
    { q: 'Anyone can cook.', who: 'Gusteau', src: 'Ratatouille', year: 2007 },
    { q: 'Not everyone can become a great artist, but a great artist can come from anywhere.', who: 'Anton Ego', src: 'Ratatouille', year: 2007 },
    { q: 'You must try things that may not work, and you must not let anyone define your limits because of where you come from.', who: 'Gusteau', src: 'Ratatouille', year: 2007 },
    { q: 'Change is nature, Dad. The part that we can influence.', who: 'Remy', src: 'Ratatouille', year: 2007 },
    { q: 'Just keep swimming.', who: 'Dory', src: 'Finding Nemo', year: 2003 },
    { q: 'Fish are friends, not food.', who: 'Bruce', src: 'Finding Nemo', year: 2003 },
    { q: 'To infinity and beyond!', who: 'Buzz Lightyear', src: 'Toy Story', year: 1995 },
    { q: 'You are a sad, strange little man, and you have my pity.', who: 'Buzz Lightyear', src: 'Toy Story', year: 1995 },
    { q: 'Oh yes, the past can hurt. But the way I see it, you can either run from it, or learn from it.', who: 'Rafiki', src: 'The Lion King', year: 1994 },
    { q: 'Remember who you are.', who: 'Mufasa', src: 'The Lion King', year: 1994 },
    { q: 'The flower that blooms in adversity is the most rare and beautiful of all.', who: 'The Emperor', src: 'Mulan', year: 1998 },
    { q: 'Adventure is out there!', who: 'Ellie', src: 'Up', year: 2009 },
    { q: 'Thanks for the adventure. Now go have a new one!', who: 'Ellie', src: 'Up', year: 2009 },
    { q: 'Ohana means family. Family means nobody gets left behind or forgotten.', who: 'Lilo', src: 'Lilo & Stitch', year: 2002 },
    { q: 'Sometimes the right path is not the easiest one.', who: 'Grandmother Willow', src: 'Pocahontas', year: 1995 },
    { q: 'Our fate lives within us. You only have to be brave enough to see it.', who: 'Merida', src: 'Brave', year: 2012 },
    { q: "I'm bad, and that's good. I will never be good, and that's not bad. There's no one I'd rather be than me.", who: 'Bad-Anon affirmation', src: 'Wreck-It Ralph', year: 2012 },
    { q: 'Look for a new angle.', who: 'Tadashi', src: 'Big Hero 6', year: 2014 },
    { q: "Crying helps me slow down and obsess over the weight of life's problems.", who: 'Sadness', src: 'Inside Out', year: 2015 },
    { q: 'No capes!', who: 'Edna Mode', src: 'The Incredibles', year: 2004 },
    { q: 'Put that thing back where it came from, or so help me!', who: 'Sulley', src: 'Monsters, Inc.', year: 2001 },
    { q: 'Ogres are like onions.', who: 'Shrek', src: 'Shrek', year: 2001 },
    { q: 'I looked at him, and I saw myself.', who: 'Hiccup', src: 'How to Train Your Dragon', year: 2010 },
    { q: 'Phenomenal cosmic powers! Itty-bitty living space.', who: 'Genie', src: 'Aladdin', year: 1992 },
    { q: "A true hero isn't measured by the size of his strength, but by the strength of his heart.", who: 'Zeus', src: 'Hercules', year: 1997 },
    { q: 'You are who you choose to be.', who: 'Hogarth', src: 'The Iron Giant', year: 1999 },
    { q: "Once you've met someone you never really forget them. It just takes a while for your memories to return.", who: 'Zeniba', src: 'Spirited Away', year: 2001 },
    { q: 'Pull the lever, Kronk!', who: 'Yzma', src: "The Emperor's New Groove", year: 2000 },
    { q: "It's so fluffy!", who: 'Agnes', src: 'Despicable Me', year: 2010 },
    { q: 'Lipstick taser!', who: 'Lucy Wilde', src: 'Despicable Me 2', year: 2013 },
    { q: 'Anyone can wear the mask.', who: 'Miles Morales', src: 'Spider-Man: Into the Spider-Verse', year: 2018 },
    { q: "That's all it is, Miles. A leap of faith.", who: 'Peter B. Parker', src: 'Spider-Man: Into the Spider-Verse', year: 2018 },
    { q: 'In Zootopia, anyone can be anything.', who: 'Judy Hopps', src: 'Zootopia', year: 2016 },
    // Live-action films
    { q: 'Sell me this pen.', who: 'Jordan Belfort', src: 'The Wolf of Wall Street', year: 2013 },
    { q: 'We used to look up at the sky and wonder at our place in the stars. Now we just look down and worry about our place in the dirt.', who: 'Cooper', src: 'Interstellar', year: 2014 },
    { q: "Murphy's law doesn't mean that something bad will happen. It means that whatever can happen, will happen.", who: 'Cooper', src: 'Interstellar', year: 2014 },
    { q: 'Manners maketh man.', who: 'Harry Hart', src: 'Kingsman: The Secret Service', year: 2014 },
    { q: 'There is nothing noble in being superior to your fellow man; true nobility is being superior to your former self.', who: 'Harry Hart', src: 'Kingsman: The Secret Service', year: 2014 },
    { q: "You mustn't be afraid to dream a little bigger, darling.", who: 'Eames', src: 'Inception', year: 2010 },
    { q: 'What is the most resilient parasite? An idea.', who: 'Cobb', src: 'Inception', year: 2010 },
    { q: 'You know what kind of plan never fails? No plan at all.', who: 'Ki-taek', src: 'Parasite', year: 2019 },
    { q: 'The D is silent.', who: 'Django', src: 'Django Unchained', year: 2012 },
    { q: 'Gentlemen, you had my curiosity. But now you have my attention.', who: 'Calvin Candie', src: 'Django Unchained', year: 2012 },
    { q: 'Get busy living, or get busy dying.', who: 'Andy Dufresne', src: 'The Shawshank Redemption', year: 1994 },
    { q: 'Hope is a good thing, maybe the best of things, and no good thing ever dies.', who: 'Andy Dufresne', src: 'The Shawshank Redemption', year: 1994 },
    { q: "I'm gonna make him an offer he can't refuse.", who: 'Vito Corleone', src: 'The Godfather', year: 1972 },
    { q: 'Leave the gun. Take the cannoli.', who: 'Clemenza', src: 'The Godfather', year: 1972 },
    { q: 'If you could see your whole life from start to finish, would you change things?', who: 'Louise Banks', src: 'Arrival', year: 2016 },
    { q: "What's happened's happened.", who: 'Neil', src: 'Tenet', year: 2020 },
    { q: "Don't try to understand it. Feel it.", who: 'Laura', src: 'Tenet', year: 2020 },
    { q: "He said that wherever I went, he would find me, walk right up to me, and I wouldn't be able to see him.", who: 'Cecilia', src: 'The Invisible Man', year: 2020 },
    { q: 'Earn this.', who: 'Captain Miller', src: 'Saving Private Ryan', year: 1998 },
    { q: "There's a point at 7,000 RPM where everything fades. The machine becomes weightless. Just disappears.", who: 'Carroll Shelby', src: 'Ford v Ferrari', year: 2019 },
    { q: 'How can you not be romantic about baseball?', who: 'Billy Beane', src: 'Moneyball', year: 2011 },
    { q: 'Adapt or die.', who: 'Billy Beane', src: 'Moneyball', year: 2011 },
    { q: 'God bless Iraq.', who: 'Efraim Diveroli', src: 'War Dogs', year: 2016 },
    { q: "That's a bingo!", who: 'Hans Landa', src: 'Inglourious Basterds', year: 2009 },
    { q: 'I think this just might be my masterpiece.', who: 'Aldo Raine', src: 'Inglourious Basterds', year: 2009 },
    { q: "My mama always said life was like a box of chocolates. You never know what you're gonna get.", who: 'Forrest Gump', src: 'Forrest Gump', year: 1994 },
    { q: 'Stupid is as stupid does.', who: 'Forrest Gump', src: 'Forrest Gump', year: 1994 },

    // TV
    { q: "I'm not superstitious, but I am a little stitious.", who: 'Michael Scott', src: 'The Office', year: '2005–2013' },
    { q: "Would I rather be feared or loved? Easy. Both. I want people to be afraid of how much they love me.", who: 'Michael Scott', src: 'The Office', year: '2005–2013' },
    { q: 'Bears. Beets. Battlestar Galactica.', who: 'Jim Halpert', src: 'The Office', year: '2005–2013' },
    { q: 'Cool. Cool cool cool.', who: 'Abed Nadir', src: 'Community', year: '2009–2015' },
    { q: 'Six seasons and a movie!', who: 'Abed Nadir', src: 'Community', year: '2009–2015' },
    { q: 'Never half-ass two things. Whole-ass one thing.', who: 'Ron Swanson', src: 'Parks and Recreation', year: '2009–2015' },
    { q: 'Treat yo self.', who: 'Tom & Donna', src: 'Parks and Recreation', year: '2009–2015' },
    { q: 'I want to go to there.', who: 'Liz Lemon', src: '30 Rock', year: '2006–2013' },
    { q: 'Never follow a hippie to a second location.', who: 'Jack Donaghy', src: '30 Rock', year: '2006–2013' },
    { q: "There's always money in the banana stand.", who: 'George Bluth Sr.', src: 'Arrested Development', year: '2003–2019' },
    { q: "I've made a huge mistake.", who: 'Gob Bluth', src: 'Arrested Development', year: '2003–2019' },
    { q: 'You come at the king, you best not miss.', who: 'Omar Little', src: 'The Wire', year: '2002–2008' },
    { q: 'All the pieces matter.', who: 'Lester Freamon', src: 'The Wire', year: '2002–2008' },
    { q: 'Winter is coming.', who: 'Ned Stark', src: 'Game of Thrones', year: '2011–2019' },
    { q: "Chaos isn't a pit. Chaos is a ladder.", who: 'Littlefinger', src: 'Game of Thrones', year: '2011–2019' },
    { q: 'I love you, but you are not serious people.', who: 'Logan Roy', src: 'Succession', year: '2018–2023' },

    // Books (spoiler-free)
    { q: "There's always another secret.", who: 'Kelsier', src: 'Mistborn: The Final Empire', year: 2006 },
    { q: 'Break the chains.', who: 'Sons of Ares', src: 'Red Rising', year: 2014 },
    { q: 'Per aspera ad astra. Through hardships to the stars.', who: 'Red Rising motto', src: 'Red Rising', year: 2014 },
  ];

  const HIDE_KEY = 'fretdriller.qotdHidden';
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);

  // Shuffle once per full cycle so no quote repeats until all of them have been shown.
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const n = QUOTES.length;
  const rnd = mulberry32(Math.floor(day / n) + 1);
  const order = QUOTES.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const quote = QUOTES[order[day % n]];

  const el = document.getElementById('qotd');
  if (!el) return;
  let hidden = false;
  try { hidden = localStorage.getItem(HIDE_KEY) === today; } catch (e) { /* storage unavailable */ }
  if (hidden) return;

  el.innerHTML = `<span class="qotd-tag">${quote.music ? '♪ ' : ''}Quote of the day</span>
    <q></q><span class="qotd-src"></span>
    <button class="qotd-x" type="button" aria-label="Hide for today" title="Hide for today">✕</button>`;
  el.querySelector('q').textContent = quote.q;
  el.querySelector('.qotd-src').textContent = `${quote.who}, ${quote.src} (${quote.year})`;
  el.querySelector('.qotd-x').addEventListener('click', () => {
    el.hidden = true;
    try { localStorage.setItem(HIDE_KEY, today); } catch (e) { /* storage unavailable */ }
  });
  el.hidden = false;
})();

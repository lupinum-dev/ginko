# Sample content for features not built yet

The `projects` and `logos` / `quotes` bricks are feature code (T5) that does not exist yet. This file holds their
sample text in all four languages, with suggested field names, so the pilot build can turn it into
`content/projects/<n>.<name>[.<locale>].md`, `content/logos/…` and `content/quotes/…`. Delete this file once that is done.
French and Arabic need a native review (see NOTES.md).

## Projects

Suggested brick `projects` (collection, order `manual`, route `{ en: '/projects/[slug]', de: '/de/projekte/[slug]',
fr: '/fr/projets/[slug]', ar: '/ar/mashari/[slug]' }`, `visible: { mode: 'until', field: 'ends' }`, Today status
`{ count: true }` so campaigns that end within 7 days show up):

| Field | Type | Notes |
|---|---|---|
| `title` | text, max 80 | |
| `slug` | slug from `title` | per locale |
| `summary` | longtext, max 300 | card text |
| `image` | image, optional | 3:2, see MEDIA.md |
| `ends` | date, optional | only for campaigns: the project leaves the site after this day |
| `gallery` | ref to a gallery, optional | per §3 ("gallery ref") |
| `body` | markdown, profile `page` | |

### 1. Clean banks (`clean-banks`, no `ends`)

- **en** — title: Clean banks · slug: clean-banks · summary: Several times a year we clear the river bank of rubbish, together with anyone who wants to help.
  Body: We clean the bank in winter, in spring and in autumn. Each time we split into small groups, each with its own stretch, so the whole town is covered. The town's waste service collects the full bags. We note where rubbish collects, and we tell the town when a place needs a bin or a sign.
- **de** — title: Saubere Ufer · slug: saubere-ufer · summary: Mehrmals im Jahr befreien wir das Flussufer von Müll, zusammen mit allen, die mithelfen wollen.
  Body: Wir räumen das Ufer im Winter, im Frühjahr und im Herbst auf. Jedes Mal teilen wir uns in kleine Gruppen mit eigenem Abschnitt auf, so ist die ganze Stadt abgedeckt. Die Stadtreinigung holt die vollen Säcke ab. Wir notieren, wo sich Müll sammelt, und sagen der Stadt Bescheid, wenn eine Stelle einen Mülleimer oder ein Schild braucht.
- **fr** — title: Des berges propres · slug: berges-propres · summary: Plusieurs fois par an, nous débarrassons les berges de leurs déchets, avec toutes les personnes qui veulent aider.
  Body: Nous nettoyons les berges en hiver, au printemps et en automne. À chaque fois, nous formons de petits groupes, chacun avec son tronçon, pour couvrir toute la ville. Le service de propreté de la ville récupère les sacs pleins. Nous notons les endroits où les déchets s’accumulent et prévenons la ville quand un endroit a besoin d’une poubelle ou d’un panneau.
- **ar** — title: ضفاف نظيفة · slug: difaf-nazifa · summary: ننظف ضفة النهر من النفايات عدة مرات في السنة، مع كل من يرغب في المساعدة.
  Body: ننظف الضفة في الشتاء والربيع والخريف. وفي كل مرة نتوزع في مجموعات صغيرة، لكل مجموعة مقطعها، لنغطي المدينة كلها. وتجمع خدمة النظافة في المدينة الأكياس الممتلئة. نسجّل الأماكن التي تتجمع فيها النفايات، ونُبلغ المدينة حين يحتاج مكان ما إلى سلة مهملات أو لافتة.

### 2. Water tests with schools (`water-tests`, no `ends`)

- **en** — title: Water tests with schools · slug: water-tests · summary: Pupils measure the river water with us once a month and learn how the river changes over the year.
  Body: With simple test kits, classes measure temperature, pH and nitrate at the same place each month. The results go into a shared table that anyone can read. We bring the kits and show how they work; teachers decide how it fits their lessons.
- **de** — title: Wassermessungen mit Schulen · slug: wassermessungen · summary: Schülerinnen und Schüler messen einmal im Monat mit uns das Flusswasser und lernen, wie sich der Fluss im Lauf des Jahres verändert.
  Body: Mit einfachen Testsets messen Klassen jeden Monat an derselben Stelle Temperatur, pH-Wert und Nitrat. Die Ergebnisse kommen in eine gemeinsame Tabelle, die alle lesen können. Wir bringen die Testsets mit und zeigen, wie sie funktionieren; die Lehrkräfte entscheiden, wie es in ihren Unterricht passt.
- **fr** — title: Analyses de l’eau avec les écoles · slug: analyses-eau · summary: Une fois par mois, des élèves mesurent l’eau de la rivière avec nous et découvrent comment elle change au fil de l’année.
  Body: Avec des kits simples, les classes mesurent chaque mois, au même endroit, la température, le pH et les nitrates. Les résultats sont reportés dans un tableau commun que chacun peut consulter. Nous apportons les kits et montrons comment ils fonctionnent ; les enseignants décident comment l’intégrer à leurs cours.
- **ar** — title: فحص المياه مع المدارس · slug: fahs-almiyah · summary: يقيس التلاميذ مياه النهر معنا مرة كل شهر، ويتعلمون كيف يتغير النهر على مدار السنة.
  Body: بأدوات فحص بسيطة، تقيس الصفوف كل شهر في المكان نفسه درجة الحرارة ودرجة الحموضة والنترات. وتُسجَّل النتائج في جدول مشترك يمكن للجميع الاطلاع عليه. نحن نُحضر الأدوات ونشرح طريقة استخدامها، ويقرر المعلمون كيف يدمجون ذلك في دروسهم.

### 3. A hedge for the bank (`hedge-campaign`, campaign, `ends: 2027-03-31`)

- **en** — title: A hedge for the bank · slug: hedge-for-the-bank · summary: We want to plant native shrubs along the bare stretch below the old mill. Help us with a donation while the campaign runs.
  Body: Below the old mill, the bank is bare and washes away after every high water. A hedge of native shrubs holds the soil and gives birds and insects a home. With the town's permission we will plant it with volunteers in spring. Your donation pays for the plants and the tree guards. [Donate now](/donate).
- **de** — title: Eine Hecke fürs Ufer · slug: hecke-fuers-ufer · summary: Wir wollen am kahlen Abschnitt unterhalb der alten Mühle heimische Sträucher pflanzen. Helfen Sie uns mit einer Spende, solange die Aktion läuft.
  Body: Unterhalb der alten Mühle ist das Ufer kahl, und nach jedem Hochwasser bricht Erde ab. Eine Hecke aus heimischen Sträuchern hält den Boden fest und gibt Vögeln und Insekten ein Zuhause. Mit Erlaubnis der Stadt pflanzen wir sie im Frühjahr mit Ehrenamtlichen. Ihre Spende bezahlt die Pflanzen und den Verbissschutz. [Jetzt spenden](/de/spenden).
- **fr** — title: Une haie pour la berge · slug: haie-pour-la-berge · summary: Nous voulons planter des arbustes locaux le long du tronçon nu, en aval du vieux moulin. Aidez-nous par un don tant que la campagne est en cours.
  Body: En aval du vieux moulin, la berge est nue et s’effrite à chaque crue. Une haie d’arbustes locaux retient la terre et offre un abri aux oiseaux et aux insectes. Avec l’accord de la ville, nous la planterons au printemps avec des bénévoles. Votre don finance les plants et leurs protections. [Faire un don](/fr/faire-un-don).
- **ar** — title: سياج نباتي للضفة · slug: siyaj-lil-diffa · summary: نريد زراعة شجيرات محلية على المقطع الأجرد أسفل الطاحونة القديمة. ساعدونا بتبرعكم ما دامت الحملة قائمة.
  Body: أسفل الطاحونة القديمة تبدو الضفة جرداء، وتنجرف تربتها بعد كل فيضان. سياج من الشجيرات المحلية يثبّت التربة ويوفّر مأوى للطيور والحشرات. وبإذن من المدينة سنزرعه في الربيع مع المتطوعين. يغطي تبرعكم ثمن الشتلات وأغطية حمايتها. [تبرّعوا الآن](/ar/tabarru).

The text names no month on purpose: create-ginko shifts `ends` (the brick has `visible: until`) but never body text,
so a month in the text would drift from `ends`. The page prints `ends` instead.

## Quotes

Suggested brick `quotes` (collection, order `manual`): `text` (longtext, max 300), `name` (text, optional, not
translated), `role` (text, optional). **These are sample quotes, not real testimonials.** The template marks them as
samples (`role` says so); replace them with real quotes, with the person's permission, before going live.

1. **en** — text: I came for one Saturday morning and stayed for the coffee and the people. Now I bring my neighbours. · role: Volunteer (sample quote)
   **de** — text: Ich kam für einen Samstagvormittag und blieb wegen des Kaffees und der Leute. Jetzt bringe ich meine Nachbarn mit. · role: Freiwillige (Beispielzitat)
   **fr** — text: Je suis venue pour un samedi matin, et je suis restée pour le café et les gens. Maintenant, j’amène mes voisins. · role: Bénévole (citation d’exemple)
   **ar** — text: جئتُ لصباح يوم سبت واحد، فبقيتُ من أجل القهوة والناس. والآن أُحضر جيراني معي. · role: متطوعة (اقتباس نموذجي)
2. **en** — text: My class finally sees why the numbers in the textbook matter. They check the river before I ask. · role: Teacher at a partner school (sample quote)
   **de** — text: Meine Klasse sieht endlich, warum die Zahlen im Schulbuch wichtig sind. Sie schauen nach dem Fluss, bevor ich frage. · role: Lehrerin an einer Partnerschule (Beispielzitat)
   **fr** — text: Ma classe comprend enfin pourquoi les chiffres du manuel comptent. Les élèves vérifient la rivière avant que je le demande. · role: Enseignante dans une école partenaire (citation d’exemple)
   **ar** — text: صار تلاميذي يفهمون أخيرًا لماذا تهمّ الأرقام في الكتاب المدرسي. إنهم يتفقدون النهر قبل أن أطلب منهم ذلك. · role: معلّمة في مدرسة شريكة (اقتباس نموذجي)

## Logos

Suggested brick `logos` (single with a list, max 12): rows `name` (text, not translated), `logo` (image with `alt`),
`url` (text, format url, optional). Sample rows use neutral placeholder marks, never real organisations:

| name | alt (en / de / fr / ar) | url |
|---|---|---|
| Partner one | Logo of a partner / Logo eines Partners / Logo d’un partenaire / شعار أحد الشركاء | — |
| Partner two | Logo of a partner / Logo eines Partners / Logo d’un partenaire / شعار أحد الشركاء | — |
| Partner three | Logo of a partner / Logo eines Partners / Logo d’un partenaire / شعار أحد الشركاء | — |

Heading for the strip: en "Who we work with" · de "Mit wem wir arbeiten" · fr "Nos partenaires" · ar "شركاؤنا".

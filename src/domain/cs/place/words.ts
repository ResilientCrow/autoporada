/**
 * Gender and number of a place noun, as its adjectives agree with it: hard
 * adjectives end in -ý (m), -á (f), -é (n), -é (pl: masculine inanimate and
 * feminine plurals) and -á (npl: neuter plurals, „kasárna“).
 */
export type PlaceGender = 'm' | 'f' | 'n' | 'pl' | 'npl';

/** The preposition a place takes in the locative: „v aule“, „na chodbě“. */
export type PlacePreposition = 'v' | 'na';

/**
 * Entries „nominative/locative“, lowercase, by preposition and gender. The
 * locative is written out, never derived, so every form can be proofread. An
 * entry of several words is a fixed name whose preposition or form differs
 * from what its words would give („botanická zahrada“ takes „v“, „zahrada“
 * alone takes „na“).
 */
export type PlaceTable = Readonly<
  Record<PlacePreposition, Readonly<Partial<Record<PlaceGender, readonly string[]>>>>
>;

/**
 * Common place nouns (ADR 0069). A new word is one more entry, no migration.
 * Words the safe endings read are not listed unless the ending gives the wrong
 * preposition (`place-phrase.ts`: -ovna, -árna, -írna, -ebna, -elna, -tna,
 * -čna take „v … -ně“; -iště takes „na … -išti“; -um takes „v … -u“).
 */
export const PLACE_WORDS: PlaceTable = {
  v: {
    m: [
      ...['sál/sále', 'sálek/sálku', 'kinosál/kinosále', 'salonek/salonku', 'salon/salonu'],
      ...['kabinet/kabinetu', 'vestibul/vestibulu', 'suterén/suterénu', 'sklep/sklepě'],
      ...['pavilon/pavilonu', 'areál/areálu', 'objekt/objektu', 'komplex/komplexu'],
      ...['prostor/prostoru', 'trakt/traktu', 'blok/bloku', 'výtah/výtahu', 'pokoj/pokoji'],
      ...['koutek/koutku', 'kout/koutě', 'bufet/bufetu', 'sklad/skladu', 'ateliér/ateliéru'],
      ...['showroom/showroomu', 'loft/loftu', 'coworking/coworkingu', 'inkubátor/inkubátoru'],
      ...['kampus/kampusu', 'klub/klubu', 'hotel/hotelu', 'motel/motelu', 'penzion/penzionu'],
      ...['hostel/hostelu', 'hostinec/hostinci', 'bar/baru', 'srub/srubu', 'kemp/kempu'],
      ...['tábor/táboře', 'stan/stanu', 'park/parku', 'lesopark/lesoparku', 'les/lese'],
      ...['sad/sadu', 'vinohrad/vinohradu', 'skleník/skleníku', 'altán/altánu'],
      ...['skanzen/skanzenu', 'palác/paláci', 'dům/domě', 'domov/domově', 'byt/bytě'],
      ...['ústav/ústavu', 'institut/institutu', 'archiv/archivu', 'depozitář/depozitáři'],
      ...['klášter/klášteře', 'kostel/kostele', 'chrám/chrámu', 'památník/památníku'],
      ...['obchod/obchodě', 'market/marketu', 'supermarket/supermarketu', 'servis/servisu'],
      ...['podnik/podniku', 'závod/závodě', 'pivovar/pivovaru', 'mlýn/mlýně'],
      ...['hangár/hangáru', 'terminál/terminálu', 'přístav/přístavu', 'tunel/tunelu'],
      ...['bunkr/bunkru', 'kryt/krytu', 'cirkus/cirkusu', 'amfiteátr/amfiteátru'],
      ...['bazén/bazénu', 'aquapark/aquaparku', 'akvapark/akvaparku'],
      ...['parlament/parlamentu', 'senát/senátu', 'rozhlas/rozhlase', 'hospic/hospici'],
      ...['kraj/kraji', 'okres/okrese', 'region/regionu', 'autobus/autobuse', 'vlak/vlaku'],
      ...['vagon/vagonu', 'kontejner/kontejneru', 'kiosek/kiosku', 'stánek/stánku'],
      ...['interiér/interiéru', 'exteriér/exteriéru', 'atelier/atelieru', 'pokojík/pokojíku'],
      ...['sklípek/sklípku', 'kostelík/kostelíku', 'antikvariát/antikvariátu', 'útulek/útulku'],
      ...['kulturák/kulturáku', 'lunapark/lunaparku', 'skatepark/skateparku', 'lesík/lesíku'],
      ...['háj/háji', 'lom/lomu', 'kaňon/kaňonu', 'kras/krasu', 'městys/městysi'],
      // Dům dětí a mládeže: „v DDM“.
      'ddm/ddm',
    ],
    f: [
      ...['místnost/místnosti', 'aula/aule', 'třída/třídě', 'dílna/dílně', 'herna/herně'],
      ...['sběrna/sběrně', 'laboratoř/laboratoři', 'kancelář/kanceláři', 'hala/hale'],
      ...['budova/budově', 'přístavba/přístavbě', 'škola/škole', 'školka/školce'],
      ...['družina/družině', 'kuchyně/kuchyni', 'kuchyň/kuchyni', 'kuchyňka/kuchyňce'],
      ...['zasedačka/zasedačce', 'mediatéka/mediatéce', 'komora/komoře', 'garáž/garáži'],
      ...['kůlna/kůlně', 'galerie/galerii', 'restaurace/restauraci'],
      ...['hospoda/hospodě', 'hospůdka/hospůdce', 'pivnice/pivnici', 'menza/menze'],
      ...['kantýna/kantýně', 'nemocnice/nemocnici'],
      ...['ordinace/ordinaci', 'firma/firmě', 'společnost/společnosti', 'banka/bance'],
      ...['centrála/centrále', 'pobočka/pobočce', 'filiálka/filiálce', 'trafika/trafice'],
      ...['drogerie/drogerii', 'tržnice/tržnici', 'pasáž/pasáži', 'aréna/aréně'],
      ...['arena/areně', 'kaple/kapli', 'krypta/kryptě', 'synagoga/synagoze'],
      ...['mešita/mešitě', 'katedrála/katedrále', 'bazilika/bazilice', 'rotunda/rotundě'],
      ...['věž/věži', 'obora/oboře', 'vila/vile', 'tvrz/tvrzi', 'pevnost/pevnosti'],
      ...['jeskyně/jeskyni', 'štola/štole', 'rokle/rokli', 'sauna/sauně', 'stáj/stáji'],
      ...['loděnice/loděnici', 'věznice/věznici', 'zbrojnice/zbrojnici', 'síň/síni'],
      ...['dvorana/dvoraně', 'rezidence/rezidenci', 'instituce/instituci'],
      ...['organizace/organizaci', 'nadace/nadaci', 'agentura/agentuře', 'redakce/redakci'],
      ...['televize/televizi', 'opera/opeře', 'filharmonie/filharmonii'],
      ...['rezervace/rezervaci', 'krajina/krajině', 'příroda/přírodě', 'obec/obci'],
      ...['vesnice/vesnici', 'osada/osadě', 'čtvrť/čtvrti', 'část/části', 'ulice/ulici'],
      ...['oblast/oblasti', 'zóna/zóně', 'lokalita/lokalitě', 'republika/republice'],
      ...['metropole/metropoli', 'tramvaj/tramvaji', 'ves/vsi', 'alej/aleji'],
      ...['výdejna/výdejně', 'prodejna/prodejně', 'poradna/poradně', 'úpravna/úpravně'],
      ...['pizzerie/pizzerii', 'vinotéka/vinotéce', 'samoobsluha/samoobsluze', 'fabrika/fabrice'],
      ...['sprcha/sprše', 'expozice/expozici', 'citadela/citadele', 'propast/propasti'],
      ...['soutěska/soutěsce', 'mš/mš', 'mč/mč', 'ppp/ppp', 'ntk/ntk'],
      // Fixed names whose head alone takes „na“.
      ...['botanická zahrada/botanické zahradě', 'zoologická zahrada/zoologické zahradě'],
      ...['valdštejnská zahrada/valdštejnské zahradě', 'vrtbovská zahrada/vrtbovské zahradě'],
      ...['královská zahrada/královské zahradě', 'františkánská zahrada/františkánské zahradě'],
      ...['ledeburská zahrada/ledeburské zahradě', 'rajská zahrada/rajské zahradě'],
      // „v pražské zoo“: ÚJČ gives feminine and neuter; feminine is the usual one.
      'zoo/zoo',
      'zimní zahrada/zimní zahradě',
    ],
    n: [
      ...['patro/patře', 'mezipatro/mezipatře', 'poschodí/poschodí', 'přízemí/přízemí'],
      ...['podkroví/podkroví', 'křídlo/křídle', 'foyer/foyer', 'lobby/lobby'],
      ...['hlediště/hledišti', 'skladiště/skladišti', 'útočiště/útočišti'],
      ...['muzeum/muzeu', 'centrum/centru', 'středisko/středisku', 'studio/studiu'],
      ...['divadlo/divadle', 'kino/kině', 'bistro/bistru', 'sídlo/sídle'],
      // -iště that take „v“, against the ending rule.
      ...['bludiště/bludišti', 'rodiště/rodišti', 'úložiště/úložišti'],
      ...['knihkupectví/knihkupectví', 'papírnictví/papírnictví', 'pekařství/pekařství'],
      ...['květinářství/květinářství', 'zahradnictví/zahradnictví', 'řeznictví/řeznictví'],
      ...['kadeřnictví/kadeřnictví', 'vydavatelství/vydavatelství'],
      ...['nakladatelství/nakladatelství', 'depo/depu', 'metro/metru', 'letadlo/letadle'],
      ...['údolí/údolí', 'město/městě', 'městečko/městečku', 'fitness centrum/fitness centru'],
      ...['zařízení/zařízení', 'stavení/stavení', 'sklepení/sklepení', 'podzemí/podzemí'],
      ...['zákulisí/zákulisí', 'podloubí/podloubí', 'okolí/okolí', 'pohoří/pohoří'],
      ...['podhůří/podhůří', 'cukrářství/cukrářství', 'vinařství/vinařství', 'opatství/opatství'],
      ...['truhlářství/truhlářství', 'zámečnictví/zámečnictví'],
      // A centrum, středisko or muzeum by its abbreviation: „v novém OC“.
      ...['kc/kc', 'oc/oc', 'svč/svč', 'spc/spc', 'ntm/ntm'],
    ],
    pl: [
      ...['učebny/učebnách', 'dílny/dílnách', 'šatny/šatnách', 'laboratoře/laboratořích'],
      ...['kanceláře/kancelářích', 'budovy/budovách', 'třídy/třídách', 'sály/sálech'],
      ...['kabinety/kabinetech', 'prostory/prostorách', 'lázně/lázních', 'jesle/jeslích'],
      ...['skály/skalách', 'tělocvičny/tělocvičnách', 'herny/hernách', 'jídelny/jídelnách'],
      ...['klubovny/klubovnách', 'sprchy/sprchách', 'sklepy/sklepích', 'skleníky/sklenících'],
      ...['ateliéry/ateliérech', 'interiéry/interiérech', 'sady/sadech', 'lesy/lesích'],
    ],
    npl: ['kasárna/kasárnách'],
  },
  na: {
    m: [
      ...['dvůr/dvoře', 'dvorek/dvorku', 'hrad/hradě', 'zámek/zámku', 'zámeček/zámečku'],
      // A camp takes „na“; the town Tábor takes „v“.
      ...['letní tábor/letním táboře', 'příměstský tábor/příměstském táboře'],
      ...['dětský tábor/dětském táboře', 'skautský tábor/skautském táboře', 'bowling/bowlingu'],
      ...['úřad/úřadě', 'magistrát/magistrátu', 'rektorát/rektorátu', 'děkanát/děkanátu'],
      ...['sekretariát/sekretariátu', 'inspektorát/inspektorátu', 'odbor/odboru'],
      ...['konzulát/konzulátu', 'internát/internátě', 'stadion/stadionu', 'zimák/zimáku'],
      ...['kurt/kurtu', 'dvorec/dvorci', 'ovál/oválu', 'okruh/okruhu', 'minigolf/minigolfu'],
      ...['velodrom/velodromu', 'hipodrom/hipodromu', 'autodrom/autodromu'],
      ...['ostrov/ostrově', 'kopec/kopci', 'vrch/vrchu', 'vrchol/vrcholu', 'svah/svahu'],
      ...['břeh/břehu', 'rybník/rybníce', 'most/mostě', 'trh/trhu', 'statek/statku'],
      ...['ranč/ranči', 'chodník/chodníku', 'trávník/trávníku', 'pozemek/pozemku'],
      ...['balkon/balkoně', 'balkón/balkóně', 'ochoz/ochozu', 'perón/peróně'],
      ...['hřbitov/hřbitově', 'venkov/venkově', 'parník/parníku'],
      ...['soud/soudu', 'potok/potoce', 'záchod/záchodě'],
      ...['úmč/úmč', 'mú/mú', 'oú/oú', 'kú/kú'],
    ],
    f: [
      ...['chodba/chodbě', 'střecha/střeše', 'půda/půdě', 'terasa/terase', 'veranda/verandě'],
      ...['recepce/recepci', 'vrátnice/vrátnici', 'plošina/plošině', 'tribuna/tribuně'],
      ...['scéna/scéně', 'zahrada/zahradě', 'zahrádka/zahrádce', 'louka/louce'],
      ...['mýtina/mýtině', 'pláž/pláži', 'náplavka/náplavce', 'hora/hoře', 'skála/skále'],
      ...['sjezdovka/sjezdovce', 'rozhledna/rozhledně', 'vyhlídka/vyhlídce'],
      ...['hvězdárna/hvězdárně', 'observatoř/observatoři', 'plovárna/plovárně'],
      ...['přehrada/přehradě', 'řeka/řece', 'vinice/vinici', 'farma/farmě', 'chata/chatě'],
      ...['chalupa/chalupě', 'bouda/boudě', 'fara/faře', 'loď/lodi', 'paluba/palubě'],
      ...['kolej/koleji', 'základna/základně', 'stanice/stanici', 'zastávka/zastávce'],
      ...['pošta/poště', 'policie/policii', 'služebna/služebně', 'radnice/radnici'],
      ...['ambasáda/ambasádě', 'burza/burze', 'skládka/skládce', 'stavba/stavbě'],
      ...['silnice/silnici', 'dálnice/dálnici', 'stezka/stezce', 'trasa/trase'],
      ...['křižovatka/křižovatce', 'dráha/dráze', 'stěna/stěně'],
      ...['poliklinika/poliklinice', 'klinika/klinice', 'ambulance/ambulanci'],
      ...['fakulta/fakultě', 'katedra/katedře', 'univerzita/univerzitě'],
      ...['akademie/akademii', 'konzervatoř/konzervatoři'],
      // Kinds of school whose head alone takes „v“ („ve škole“).
      ...['základní škola/základní škole', 'střední škola/střední škole'],
      ...['vysoká škola/vysoké škole', 'průmyslová škola/průmyslové škole'],
      'základní umělecká škola/základní umělecké škole',
      'střední odborná škola/střední odborné škole',
      'střední průmyslová škola/střední průmyslové škole',
      'vyšší odborná škola/vyšší odborné škole',
      // Indeclinable school abbreviations: „na ZŠ Grafická“.
      ...['zš/zš', 'sš/sš', 'vš/vš', 'zuš/zuš', 'spš/spš', 'soš/soš', 'voš/voš'],
      // -ovna, -elna, -čna that take „na“, against the ending rule.
      ...['hájovna/hájovně', 'ohlašovna/ohlašovně', 'podatelna/podatelně'],
      ...['pozorovatelna/pozorovatelně', 'točna/točně', 'lodžie/lodžii', 'diskotéka/diskotéce'],
      ...['myslivna/myslivně', 'hájenka/hájence', 'základka/základce', 'toaleta/toaletě'],
      ...['střelnice/střelnici', 'výstava/výstavě', 'nádrž/nádrži', 'stráň/stráni', 'pláň/pláni'],
      ...['paseka/pasece', 'samota/samotě', 'zřícenina/zřícenině', 'bašta/baště'],
      // Universities and faculties by their abbreviation: „na VŠCHT“, „na MFF UK“.
      ...['všcht/všcht', 'čzu/čzu', 'uk/uk', 'muni/muni', 'amu/amu'],
      ...['damu/damu', 'famu/famu', 'avu/avu', 'mff/mff', 'pedf/pedf', 'přf/přf', 'fel/fel'],
      'fsv/fsv',
    ],
    n: [
      ...['náměstí/náměstí', 'nábřeží/nábřeží', 'nádvoří/nádvoří', 'nádraží/nádraží'],
      ...['pobřeží/pobřeží', 'prostranství/prostranství', 'pódium/pódiu', 'fórum/fóru'],
      ...['gymnázium/gymnáziu', 'lyceum/lyceu', 'ministerstvo/ministerstvu'],
      ...['gymnasium/gymnasiu', 'podium/podiu', 'sou/sou'],
      ...['ředitelství/ředitelství', 'velitelství/velitelství', 'oddělení/oddělení'],
      ...['velvyslanectví/velvyslanectví', 'jezero/jezeře', 'moře/moři', 'pole/poli'],
      ...['hejtmanství/hejtmanství', 'zastupitelství/zastupitelství', 'předměstí/předměstí'],
      ...['náměstíčko/náměstíčku', 'rozcestí/rozcestí', 'úbočí/úbočí', 'molo/molu', 'wc/wc'],
      // Vysoké učení technické: „na pražském ČVUT“.
      ...['čvut/čvut', 'vut/vut'],
    ],
    pl: [
      ...['hory/horách', 'koleje/kolejích', 'kurty/kurtech', 'zahrady/zahradách'],
      ...['toalety/toaletách', 'záchody/záchodech', 'chodby/chodbách', 'kopce/kopcích'],
      ...['louky/loukách', 'pozemky/pozemcích', 'tribuny/tribunách', 'terasy/terasách'],
      ...['hradby/hradbách', 'ostrovy/ostrovech', 'hřbitovy/hřbitovech'],
    ],
  },
};

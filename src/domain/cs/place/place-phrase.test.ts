import { describe, expect, it } from 'vitest';

import { NAMES_BY_CAPITALS, PLACE_NAMES, QUARTERS } from './names';
import { placePhrase, type PlaceKind } from './place-phrase';
import { PLACE_WORDS, type PlaceTable } from './words';

type Row = readonly [typed: string, text: string];

/** Already a phrase for the sentence: printed as typed, whitespace tidied. */
const TYPED: readonly Row[] = [
  ['v aule', 'v aule'],
  ['V aule', 'V aule'],
  ['  v   aule ', 'v aule'],
  ['na Pražském hradě', 'na Pražském hradě'],
  ['ve sborovně', 've sborovně'],
  ['U Fleků', 'U Fleků'],
  ['u Vltavy', 'u Vltavy'],
  ['před budovou školy', 'před budovou školy'],
  ['mezi pavilony A a B', 'mezi pavilony A a B'],
  ['přes MS Teams', 'přes MS Teams'],
  ['mimo školu', 'mimo školu'],
  ['Na Vidouli', 'Na Vidouli'],
  ['Na Pankráci 15', 'Na Pankráci 15'],
  ['online', 'online'],
  ['Online (MS Teams)', 'Online (MS Teams)'],
  ['distančně', 'distančně'],
  ['venku před školou', 'venku před školou'],
  ['', ''],
  ['   ', ''],
  ['dle rozpisu', 'dle rozpisu'],
  ['různě', 'různě'],
  // No letter or digit names no place: the sentence goes without one.
  ['-', ''],
  ['?', ''],
];

/** Read: a room code, an online tool, a noun phrase from the lists and rules. */
const READ: readonly Row[] = [
  // Room codes and online tools.
  ['S206', 'v učebně S206'],
  ['S8', 'v učebně S8'],
  [' R12A ', 'v učebně R12A'],
  ['205', 'v učebně 205'],
  ['MS Teams', 'v aplikaci MS Teams'],
  ['Teams', 'v aplikaci Teams'],
  ['Microsoft Teams', 'v aplikaci Microsoft Teams'],
  ['Zoom', 'v aplikaci Zoom'],
  ['Google Meet', 'v aplikaci Google Meet'],
  ['Webex', 'v aplikaci Webex'],
  // School rooms.
  ['místnost S205', 'v místnosti S205'],
  ['Místnost S205', 'v Místnosti S205'],
  ['učebna S206', 'v učebně S206'],
  ['aula', 'v aule'],
  ['Aula', 'v Aule'],
  ['sborovna', 've sborovně'],
  ['tělocvična', 'v tělocvičně'],
  ['velká tělocvična', 've velké tělocvičně'],
  ['malá tělocvična', 'v malé tělocvičně'],
  ['jídelna', 'v jídelně'],
  ['školní jídelna', 've školní jídelně'],
  ['knihovna', 'v knihovně'],
  ['Městská knihovna', 'v Městské knihovně'],
  ['Národní technická knihovna', 'v Národní technické knihovně'],
  ['dílna', 'v dílně'],
  ['dílny', 'v dílnách'],
  ['školní dílny', 've školních dílnách'],
  ['šatna', 'v šatně'],
  ['laboratoř fyziky', 'v laboratoři fyziky'],
  ['Laboratoř fyziky a chemie', 'v Laboratoři fyziky a chemie'],
  ['chemická laboratoř', 'v chemické laboratoři'],
  ['kabinet matematiky', 'v kabinetu matematiky'],
  ['ředitelna', 'v ředitelně'],
  ['zasedací místnost', 'v zasedací místnosti'],
  ['Zasedací místnost zastupitelstva Prahy 5', 'v Zasedací místnosti zastupitelstva Prahy 5'],
  ['CAD učebna', 'v CAD učebně'],
  ['IT učebna 3', 'v IT učebně 3'],
  ['PC učebna', 'v PC učebně'],
  ['počítačová učebna', 'v počítačové učebně'],
  ['jazyková učebna J2', 'v jazykové učebně J2'],
  ['chodba', 'na chodbě'],
  ['chodba ve 2. patře', 'na chodbě ve 2. patře'],
  ['školní dvůr', 'na školním dvoře'],
  ['dvůr', 'na dvoře'],
  ['Školní zahrada', 'na Školní zahradě'],
  ['2. patro budovy B', 've 2. patře budovy B'],
  ['1. patro', 'v 1. patře'],
  ['3. patro', 've 3. patře'],
  ['5. patro', 'v 5. patře'],
  ['přízemí', 'v přízemí'],
  ['suterén', 'v suterénu'],
  ['vestibul školy', 've vestibulu školy'],
  ['foyer', 've foyer'],
  ['hlavní budova', 'v hlavní budově'],
  ['budova A', 'v budově A'],
  ['pavilon B', 'v pavilonu B'],
  ['hřiště', 'na hřišti'],
  ['školní hřiště', 'na školním hřišti'],
  ['víceúčelové hřiště', 'na víceúčelovém hřišti'],
  ['Sportovní hala', 've Sportovní hale'],
  ['posilovna', 'v posilovně'],
  ['studovna', 've studovně'],
  ['klubovna', 'v klubovně'],
  ['školní družina', 've školní družině'],
  ['recepce', 'na recepci'],
  ['vrátnice', 'na vrátnici'],
  ['kancelář ředitele', 'v kanceláři ředitele'],
  ['sekretariát', 'na sekretariátu'],
  ['třída 3.B', 've třídě 3.B'],
  ['kmenová třída', 'v kmenové třídě'],
  ['atrium', 'v atriu'],
  ['terasa', 'na terase'],
  ['střecha školy', 'na střeše školy'],
  ['zkušebna', 've zkušebně'],
  ['kuchyňka', 'v kuchyňce'],
  ['naše škola', 'v naší škole'],
  ['náš areál', 'v našem areálu'],
  ['škola', 've škole'],
  ['mateřská škola', 'v mateřské škole'],
  // Schools and universities.
  ['Smíchovská střední škola', 'na Smíchovské střední škole'],
  // A capitalised adjective after the noun is a name (a street) and stays as typed.
  ['Základní škola Grafická', 'na Základní škole Grafická'],
  ['Hotel Zlatý', 'v Hotelu Zlatý'],
  ['Budova Hybernská', 'v Budově Hybernská'],
  ['ZŠ Grafická', 'na ZŠ Grafická'],
  ['DDM Praha 5', 'v DDM Praha 5'],
  ['Gymnázium Na Zatlance', 'na Gymnáziu Na Zatlance'],
  ['Matematicko-fyzikální fakulta UK', 'na Matematicko-fyzikální fakultě UK'],
  ['Pedagogická fakulta UK', 'na Pedagogické fakultě UK'],
  ['Fakulta elektrotechnická ČVUT', 'na Fakultě elektrotechnické ČVUT'],
  ['Karlova univerzita', 'na Karlově univerzitě'],
  ['Univerzita Karlova', 'na Univerzitě Karlově'],
  ['Vysoká škola ekonomická', 'na Vysoké škole ekonomické'],
  ['Česká zemědělská univerzita', 'na České zemědělské univerzitě'],
  ['Kampus Hybernská', 'v Kampusu Hybernská'],
  ['Ministerstvo školství', 'na Ministerstvu školství'],
  // Venues.
  ['Národní muzeum', 'v Národním muzeu'],
  ['Národní divadlo', 'v Národním divadle'],
  ['divadlo Viola', 'v divadle Viola'],
  ['Divadlo Viola, Národní 7, Praha 1', 'v Divadle Viola, Národní 7, Praha 1'],
  ['kino Lucerna', 'v kině Lucerna'],
  ['Lucerna', 'v Lucerně'],
  ['Rudolfinum', 'v Rudolfinu'],
  ['Karolinum', 'v Karolinu'],
  ['Klementinum', 'v Klementinu'],
  ['Planetárium Praha', 'v Planetáriu Praha'],
  ['Národní galerie', 'v Národní galerii'],
  ['Veletržní palác', 've Veletržním paláci'],
  ['Obecní dům', 'v Obecním domě'],
  ['Tančící dům', 'v Tančícím domě'],
  ['Dům dětí a mládeže', 'v Domě dětí a mládeže'],
  ['O2 arena', 'v O2 areně'],
  ['Sportovní areál Strahov', 've Sportovním areálu Strahov'],
  ['Strahovský stadion', 'na Strahovském stadionu'],
  ['zimní stadion', 'na zimním stadionu'],
  ['bazén Podolí', 'v bazénu Podolí'],
  ['plavecký bazén', 'v plaveckém bazénu'],
  ['koupaliště', 'na koupališti'],
  ['kluziště', 'na kluzišti'],
  ['Výstaviště', 'na Výstavišti'],
  ['hlediště', 'v hledišti'],
  ['Hvězdárna Ďáblice', 'na Hvězdárně Ďáblice'],
  ['Štefánikova hvězdárna', 'na Štefánikově hvězdárně'],
  ['rozhledna', 'na rozhledně'],
  ['botanická zahrada', 'v botanické zahradě'],
  ['Botanická zahrada Troja', 'v Botanické zahradě Troja'],
  ['zoologická zahrada', 'v zoologické zahradě'],
  ['zoo', 'v zoo'],
  ['Zoo Praha', 'v Zoo Praha'],
  ['Muzeum hlavního města Prahy', 'v Muzeu hlavního města Prahy'],
  ['Technické muzeum v Brně', 'v Technickém muzeu v Brně'],
  ['fotostudio', 've fotostudiu'],
  ['autodílna', 'v autodílně'],
  ['skiareál', 've skiareálu'],
  ['Sportcentrum', 've Sportcentru'],
  ['fitness centrum', 've fitness centru'],
  ['kavárna', 'v kavárně'],
  ['cukrárna', 'v cukrárně'],
  ['restaurace U Medvídků', 'v restauraci U Medvídků'],
  ['Restaurace Zlatá Hvězda', 'v Restauraci Zlatá Hvězda'],
  ['hotel Pyramida', 'v hotelu Pyramida'],
  ['chata', 'na chatě'],
  ['Luční bouda', 'na Luční boudě'],
  ['tábořiště', 'na tábořišti'],
  ['kemp', 'v kempu'],
  ['Kostel sv. Mikuláše', 'v Kostele sv. Mikuláše'],
  ['Betlémská kaple', 'v Betlémské kapli'],
  ['katedrála sv. Víta', 'v katedrále sv. Víta'],
  // Prague.
  ['Pražský hrad', 'na Pražském hradě'],
  ['Hrad', 'na Hradě'],
  ['zámek Konopiště', 'na zámku Konopiště'],
  ['Karlův most', 'na Karlově mostě'],
  ['Václavské náměstí', 'na Václavském náměstí'],
  ['Karlovo náměstí 13', 'na Karlově náměstí 13'],
  ['Staroměstské náměstí', 'na Staroměstském náměstí'],
  ['Náměstí Míru', 'na Náměstí Míru'],
  ['Národní třída', 'na Národní třídě'],
  ['Smíchovské nádraží', 'na Smíchovském nádraží'],
  ['Hlavní nádraží', 'na Hlavním nádraží'],
  ['Masarykovo nádraží', 'na Masarykově nádraží'],
  ['letiště Václava Havla', 'na letišti Václava Havla'],
  ['zastávka Anděl', 'na zastávce Anděl'],
  ['Anděl', 'na Andělu'],
  ['Smetanovo nábřeží', 'na Smetanově nábřeží'],
  ['náplavka', 'na náplavce'],
  ['Střelecký ostrov', 'na Střeleckém ostrově'],
  ['Petřín', 'na Petříně'],
  ['Kampa', 'na Kampě'],
  ['Stromovka', 've Stromovce'],
  ['Divoká Šárka', 'v Divoké Šárce'],
  ['Letná', 'na Letné'],
  ['Vyšehrad', 'na Vyšehradě'],
  ['Smíchov', 'na Smíchově'],
  ['Radlice', 'v Radlicích'],
  ['Vinohrady', 'na Vinohradech'],
  ['Žižkov', 'na Žižkově'],
  ['Karlín', 'v Karlíně'],
  ['Holešovice', 'v Holešovicích'],
  ['Dejvice', 'v Dejvicích'],
  ['Vršovice', 've Vršovicích'],
  ['Strašnice', 've Strašnicích'],
  ['Barrandov', 'na Barrandově'],
  ['Jižní Město', 'na Jižním Městě'],
  ['Staré Město', 'na Starém Městě'],
  ['Malá Strana', 'na Malé Straně'],
  ['Černý Most', 'na Černém Mostě'],
  ['Kavčí hory', 'na Kavčích horách'],
  // Towns, regions, countries.
  ['Praha', 'v Praze'],
  ['Praha 5', 'v Praze 5'],
  ['Brno', 'v Brně'],
  ['Plzeň', 'v Plzni'],
  ['Ostrava', 'v Ostravě'],
  ['Olomouc', 'v Olomouci'],
  ['Pardubice', 'v Pardubicích'],
  ['České Budějovice', 'v Českých Budějovicích'],
  ['Hradec Králové', 'v Hradci Králové'],
  ['Ústí nad Labem', 'v Ústí nad Labem'],
  ['Karlovy Vary', 'v Karlových Varech'],
  ['Mariánské Lázně', 'v Mariánských Lázních'],
  ['Český Krumlov', 'v Českém Krumlově'],
  ['Kutná Hora', 'v Kutné Hoře'],
  ['Mladá Boleslav', 'v Mladé Boleslavi'],
  ['Jindřichův Hradec', 'v Jindřichově Hradci'],
  ['Havlíčkův Brod', 'v Havlíčkově Brodě'],
  ['Špindlerův Mlýn', 've Špindlerově Mlýně'],
  ['Uherské Hradiště', 'v Uherském Hradišti'],
  ['Nové Město na Moravě', 'v Novém Městě na Moravě'],
  ['Dvůr Králové nad Labem', 've Dvoře Králové nad Labem'],
  ['Frýdek-Místek', 've Frýdku-Místku'],
  ['Zlín', 've Zlíně'],
  ['Znojmo', 've Znojmě'],
  ['Vsetín', 've Vsetíně'],
  ['Svitavy', 've Svitavách'],
  ['Tábor', 'v Táboře'],
  ['Terezín', 'v Terezíně'],
  ['Lidice', 'v Lidicích'],
  ['Karlštejn', 'na Karlštejně'],
  ['hrad Karlštejn', 'na hradě Karlštejn'],
  ['Kladno', 'na Kladně'],
  ['Lipno', 'na Lipně'],
  ['Sněžka', 'na Sněžce'],
  ['Šumava', 'na Šumavě'],
  ['Krkonoše', 'v Krkonoších'],
  ['Jizerské hory', 'v Jizerských horách'],
  ['hory', 'na horách'],
  ['Beskydy', 'v Beskydech'],
  ['Pec pod Sněžkou', 'v Peci pod Sněžkou'],
  ['Harrachov', 'v Harrachově'],
  ['Hluboká nad Vltavou', 'v Hluboké nad Vltavou'],
  ['Vídeň', 've Vídni'],
  ['Mnichov', 've Mnichově'],
  ['Berlín', 'v Berlíně'],
  ['Drážďany', 'v Drážďanech'],
  ['Bratislava', 'v Bratislavě'],
  ['Slovensko', 'na Slovensku'],
  ['Německo', 'v Německu'],
  ['Francie', 've Francii'],
  ['Švýcarsko', 've Švýcarsku'],
  ['Velká Británie', 've Velké Británii'],
  ['Morava', 'na Moravě'],
  ['Vysočina', 'na Vysočině'],
  ['Ukrajina', 'na Ukrajině'],
  ['USA', 'v USA'],
  ['Česká republika', 'v České republice'],
  // Typed already in the locative: only the preposition is missing.
  ['učebně S206', 'v učebně S206'],
  ['aule', 'v aule'],
  ['tělocvičně', 'v tělocvičně'],
  ['velké tělocvičně', 've velké tělocvičně'],
  ['Národním muzeu', 'v Národním muzeu'],
  ['Praze', 'v Praze'],
  ['chodbě', 'na chodbě'],
  ['hřišti', 'na hřišti'],
  ['Starém Městě', 'na Starém Městě'],
  // Lists: a conjunction before another place reads that place too.
  ['aula a tělocvična', 'v aule a v tělocvičně'],
  ['aula a tělocvična ve 2. patře', 'v aule a v tělocvičně ve 2. patře'],
  ['aula nebo školní dvůr', 'v aule nebo na školním dvoře'],
  ['aula i chodba', 'v aule i na chodbě'],
  ['aula a v tělocvičně', 'v aule a v tělocvičně'],
  ['kabinet fyziky a knihovna', 'v kabinetu fyziky a v knihovně'],
  ['učebny S201 a S202', 'v učebnách S201 a S202'],
  ['Muzeum města a regionu', 'v Muzeu města a regionu'],
  // Found in review (ADR 0069): listed exceptions to the endings, and names.
  ['S 205', 'v učebně S 205'],
  ['V 2', 'v učebně V 2'],
  ['podatelna', 'na podatelně'],
  ['Bludiště na Petříně', 'v Bludišti na Petříně'],
  ['Hájovna', 'na Hájovně'],
  ['podium', 'na podiu'],
  ['letní tábor', 'na letním táboře'],
  ['Tábor', 'v Táboře'],
  ['Valdštejnská zahrada', 've Valdštejnské zahradě'],
  ['školní zahrada', 'na školní zahradě'],
  ['pražská zoo', 'v pražské zoo'],
  ['Smíchovské SOU', 'na Smíchovském SOU'],
  ['Hradec Králové', 'v Hradci Králové'],
  ['Dvůr Králové', 've Dvoře Králové'],
  ['Šternberk', 've Šternberku'],
  ['lodžie', 'na lodžii'],
  ['Ústí nad Labem', 'v Ústí nad Labem'],
  ['Praha 5', 'v Praze 5'],
  ['Brno, Výstaviště', 'v Brně, na Výstavišti'],
  ['Staré Město a Josefov', 'na Starém Městě a v Josefově'],
  ['Hluboká jeskyně', 'v Hluboké jeskyni'],
  ['Nové Město pod Smrkem', 'v Novém Městě pod Smrkem'],
  ['Dvůr Králové nad Labem', 've Dvoře Králové nad Labem'],
  // Second review (ADR 0069): capitals, room lists, commas, hyphens, determiners.
  ['ŠKOLA', 've ŠKOLE'],
  ['STEM učebna', 've STEM učebně'],
  ['SW učebna', 'v SW učebně'],
  ['VR učebna', 've VR učebně'],
  ['S201 a S202', 'v učebnách S201 a S202'],
  ['S201, S202', 'v učebnách S201, S202'],
  ['S201, S202 a S203', 'v učebnách S201, S202 a S203'],
  ['S201–S203', 'v učebnách S201–S203'],
  ['S201 nebo S202', 'v učebně S201 nebo S202'],
  ['aula, tělocvična a hřiště', 'v aule, v tělocvičně a na hřišti'],
  ['učebna S205, 2. patro', 'v učebně S205, ve 2. patře'],
  ['Hotel Krakonoš, salonek', 'v Hotelu Krakonoš, v salonku'],
  ['Národní muzeum, Václavské náměstí 68', 'v Národním muzeu, na Václavském náměstí 68'],
  ['Kino Atlas, Sokolovská 1', 'v Kině Atlas, Sokolovská 1'],
  ['Smíchov, Praha 5', 'na Smíchově, Praha 5'],
  ['aula, Makerspace', 'v aule, Makerspace'],
  ['Praha-Smíchov', 'v Praze-Smíchově'],
  ['všechny třídy', 've všech třídách'],
  ['obě tělocvičny', 'v obou tělocvičnách'],
  ['oba sály', 'v obou sálech'],
  ['ČVUT', 'na ČVUT'],
  ['MFF UK', 'na MFF UK'],
  ['FEL ČVUT', 'na FEL ČVUT'],
  ['DDM Praha 5', 'v DDM Praha 5'],
  ['Strakova akademie', 've Strakově akademii'],
  ['Boží Dar', 'na Božím Daru'],
  ['toalety', 'na toaletách'],
  ['WC', 'na WC'],
  ['letenská pláň', 'na letenské pláni'],
  ['Olšanské hřbitovy', 'na Olšanských hřbitovech'],
  ['Emauzy', 'v Emauzích'],
  ['Zlíchov', 'na Zlíchově'],
  ['Riegrovy sady', 'v Riegrových sadech'],
  ['Vysoké Tatry', 've Vysokých Tatrách'],
  ['Černá Hora', 'v Černé Hoře'],
  ['Lysá hora', 'na Lysé hoře'],
  ['Moravský kras', 'v Moravském krasu'],
  ['Pedagogicko-psychologická poradna', 'v Pedagogicko-psychologické poradně'],
  ['školské zařízení', 've školském zařízení'],
  ['Velká Chuchle', 've Velké Chuchli'],
  ['Horní Počernice', 'v Horních Počernicích'],
  ['Kanárské ostrovy', 'na Kanárských ostrovech'],
  ['New York', 'v New Yorku'],
  ['Kolín nad Rýnem', 'v Kolíně nad Rýnem'],
  // Third review (ADR 0069): abbreviations, capitals after a comma, quarters, spelled capitals.
  ['nové OC', 'v novém OC'],
  ['pražské ČVUT', 'na pražském ČVUT'],
  ['brněnské VUT', 'na brněnském VUT'],
  ['ČVUT menza', 'v ČVUT menze'],
  ['UK aula', 'v UK aule'],
  ['NTK studovna', 'v NTK studovně'],
  ['DDM klubovna', 'v DDM klubovně'],
  ['Hrádek nad Nisou', 'v Hrádku nad Nisou'],
  ['Černá hora', 'na Černé hoře'],
  ['ZŠ Zlatnická, Most', 'na ZŠ Zlatnická, Most'],
  ['Hotel Krakonoš, Ostrov', 'v Hotelu Krakonoš, Ostrov'],
  ['chata, Malá Skála', 'na chatě, Malá Skála'],
  ['chata, Dolní Dvůr', 'na chatě, Dolní Dvůr'],
  ['Praha 6, ČVUT', 'v Praze 6, na ČVUT'],
  ['Pražský hrad, Španělský sál', 'na Pražském hradě, ve Španělském sále'],
  ['aula, nebo tělocvična', 'v aule, nebo v tělocvičně'],
  ['aula, případně tělocvična', 'v aule, případně v tělocvičně'],
  ['Ostrava-Vítkovice', 'v Ostravě-Vítkovicích'],
  ['Praha-Vinohrady', 'v Praze-Vinohradech'],
  ['S 201 a S 202', 'v učebnách S 201 a S 202'],
  ['S201, S202 nebo S203', 'v učebně S201, S202 nebo S203'],
  ['SPŠE dílna', 'v SPŠE dílně'],
  ['ČTÚ učebna', 'v ČTÚ učebně'],
  ['SVČ', 'v SVČ'],
  ['VUT', 'na VUT'],
  ['ČERNÁ HORA', 'v ČERNÉ HOŘE'],
];

/** Unread: a lead-in by what was typed, the place kept as typed (ADR 0069). */
const NAMED: readonly Row[] = [
  ['IKEM', 'v prostorách IKEM'],
  ['VŠE', 'v prostorách VŠE'],
  ['DOX', 'v prostorách DOX'],
  ['Národní 7, Praha 1', 'na adrese Národní 7, Praha 1'],
  ['Plzeňská 10', 'na adrese Plzeňská 10'],
  ['Radlická 1a', 'na adrese Radlická 1a'],
  ['Vltavská 1234/5', 'na adrese Vltavská 1234/5'],
  ['Karlova 3', 'na adrese Karlova 3'],
  ['Hybernská 4, Praha 1', 'na adrese Hybernská 4, Praha 1'],
  ['Makerspace', 'v prostorách s názvem Makerspace'],
  ['Makerspace 2', 'v prostorách s názvem Makerspace 2'],
  ['Ladronka', 'v prostorách s názvem Ladronka'],
  ['Impact Hub', 'v prostorách s názvem Impact Hub'],
  ['Forum Karlín', 'v prostorách s názvem Forum Karlín'],
  ['Praha-Makerspace', 'v prostorách s názvem Praha-Makerspace'],
  ['telocvicna', 'v prostorách s názvem telocvicna'],
  // A hard adjective that does not agree with the noun: never guess which one is wrong.
  ['Krajský knihovna', 'v prostorách s názvem Krajský knihovna'],
  ['Velké tělocvična', 'v prostorách s názvem Velké tělocvična'],
  // Found in review (ADR 0069): what would have been read wrongly.
  ['aula/tělocvična', 'v prostorách s názvem aula/tělocvična'],
  ['kabinet/sborovna', 'v prostorách s názvem kabinet/sborovna'],
  ['Smíchov City', 'v prostorách s názvem Smíchov City'],
  ['Karlín Hall', 'v prostorách s názvem Karlín Hall'],
  ['Lucerna Music Bar', 'v prostorách s názvem Lucerna Music Bar'],
  ['Hluboká voda', 'v prostorách s názvem Hluboká voda'],
  ['Dlouhá třída', 'v prostorách s názvem Dlouhá třída'],
  ['Vinohradská třída', 'v prostorách s názvem Vinohradská třída'],
  ['aula a Makerspace', 'v prostorách s názvem aula a Makerspace'],
  // A hyphen joins a town and its quarter, not two towns.
  ['Praha-Brno', 'v prostorách s názvem Praha-Brno'],
  ['Vídeň-Bratislava', 'v prostorách s názvem Vídeň-Bratislava'],
  ['Praha-Staré Město', 'v prostorách s názvem Praha-Staré Město'],
];

const KINDS: readonly (readonly [PlaceKind, readonly Row[]])[] = [
  ['typed', TYPED],
  ['read', READ],
  ['named', NAMED],
];

describe('placePhrase', () => {
  for (const [kind, rows] of KINDS) {
    it.each(rows)(`${kind}: %j → %j`, (typed, text) => {
      expect(placePhrase(typed)).toEqual({ kind, text });
    });
  }

  it.each([...READ, ...NAMED])('reads its own result as typed: %j', (typed) => {
    const { text } = placePhrase(typed);
    expect(placePhrase(text)).toEqual({ kind: 'typed', text });
  });
});

const entries = (table: PlaceTable) =>
  Object.entries(table).flatMap(([preposition, genders]) =>
    Object.entries(genders).flatMap(([gender, list]) =>
      (list ?? []).map((entry) => ({ preposition, gender, entry })),
    ),
  );

const ALL = [...entries(PLACE_WORDS), ...entries(PLACE_NAMES)];
const NAMES = new Set(entries(PLACE_NAMES).map(({ entry }) => entry.split('/')[0]));
const SMALL_WORDS = new Set(['nad', 'pod', 'na', 'u']);
/** A name as people type it: „Černá Hora“, „Ústí nad Labem“. */
const asTyped = (nominative: string): string =>
  NAMES.has(nominative)
    ? nominative
        .split(' ')
        .map((word) =>
          SMALL_WORDS.has(word) ? word : word.charAt(0).toLocaleUpperCase('cs') + word.slice(1),
        )
        .join(' ')
    : nominative;

describe('the place lists', () => {
  it('write each entry as lowercase „nominative/locative“ with the same number of words', () => {
    for (const { entry } of ALL) {
      const parts = entry.split('/');
      expect(parts, entry).toHaveLength(2);
      const [nominative = '', locative = ''] = parts;
      expect(entry, entry).toBe(entry.toLocaleLowerCase('cs'));
      expect(nominative.split(' ').length, entry).toBe(locative.split(' ').length);
      expect(entry, entry).toMatch(
        /^\p{L}[\p{L}-]*(?: [\p{L}-]+)*\/\p{L}[\p{L}-]*(?: [\p{L}-]+)*$/u,
      );
    }
  });

  it('list no nominative twice', () => {
    const seen = new Map<string, string>();
    for (const { entry } of ALL) {
      const [nominative = ''] = entry.split('/');
      expect(seen.get(nominative), `${entry} and ${seen.get(nominative)}`).toBeUndefined();
      seen.set(nominative, entry);
    }
  });

  it('give one preposition to each locative', () => {
    const preposition = new Map<string, string>();
    for (const { entry, preposition: own } of ALL) {
      const [, locative = ''] = entry.split('/');
      expect(preposition.get(locative) ?? own, entry).toBe(own);
      preposition.set(locative, own);
    }
  });

  it.each(ALL)('read every entry alone: $entry', ({ preposition, entry }) => {
    const [nominative = '', locative = ''] = entry.split('/');
    const { kind, text } = placePhrase(asTyped(nominative));
    expect(kind).toBe('read');
    const [lead, ...rest] = text.split(' ');
    expect(preposition === 'na' ? ['na'] : ['v', 've']).toContain(lead);
    expect(rest.join(' ').toLocaleLowerCase('cs')).toBe(locative);
  });

  it('list only listed names as quarters or names read by their capitals', () => {
    for (const name of [...QUARTERS, ...NAMES_BY_CAPITALS])
      expect(NAMES.has(name), name).toBe(true);
  });
});

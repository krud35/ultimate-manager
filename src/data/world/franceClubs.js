// User-supplied Open results. Coordinates are approximate city locations for regional allocation.
// Freezgo's second entry is provisionally treated as reserves; Friz'Toi and UFO omitted.
const rows = `1|Tchac|Pornichet|8|8|56
1|Stade Bordelais|Bordeaux|8|6|12
1|PUC Ultimate|Paris|8|3|-2
1|RFO|La Rochelle|8|4|0
1|F5|Baillet-en-France|8|2|-23
1|BTR|Toulouse|8|2|-21
1|Monkey|Grenoble|8|5|2
1|Freezgo|Blois|8|5|9
1|Magic Disc|Angers|8|3|-16
1|NLSU|Noisy-le-Sec|8|7|45
1|Tsunami|Nemours|8|3|-12
1|Sun|Créteil|8|0|-40
2|Magic Disc 2|Angers|8|1|-31
2|Frisbeurs|Nantes|8|6|17
2|Ouf|Joué-lès-Tours|8|6|29
2|Roazhon Ultimate|Rennes|8|7|44
2|Révolution'Air|Paris|8|5|8
2|Phoenix|Montrouge|8|2|-44
2|Zérogêne|Plaisir|8|3|-8
2|Power Rouengers|Rouen|8|2|-15
2|Friz'Bisontins|Besançon|8|5|8
2|A.S.U.L. Ultimate|Villeurbanne|8|5|22
2|Chamber'|Chambéry|8|1|-46
2|Sesquidistus|Strasbourg|8|6|23
2|Disjonctés|Dijon|8|8|49
2|Les Marsiens|Marseille|8|3|-5
2|Clapas|Montpellier|8|2|-37
2|Les Gones|Lyon|8|2|-14
2|Fus'Yon|La Roche-sur-Yon|8|3|1
2|Tchac 2|Pornichet|8|6|39
2|Disc'Gestifs|Cognac|8|4|4
2|Freezgo 2|Blois|8|2|-26
2|Jets|Challans|8|6|53
2|Friselis|Versailles|8|7|45
2|Manchots|Le Mans|8|4|4
3|Raging Bananas|Nantes|8|5|16
3|Plouf|La Chevrolière|8|4|10
3|Jack'Suns|Fontenay-le-Comte|8|2|-16
3|RFO 2|La Rochelle|8|2|-25
3|Frisbeurs 2|Nantes|8|3|-12
3|Fly Disc'R|Orléans|8|8|41
3|OUF 2|Joué-lès-Tours|8|5|-6
3|Jets 2|Challans|8|3|-8
3|Frog Disc Section|Évry|8|4|-7
3|HOT|La Celle-Saint-Cloud|8|2|-35
3|NLSU 2|Noisy-le-Sec|8|7|63
3|Révolution'Air 2|Paris|8|1|-41
3|Phoenix 2|Montrouge|8|2|-46
3|PUC Ultimate 2|Paris|8|6|25
3|Synoptic|Saint-Germain-en-Laye|8|3|-20
3|Salamanders|Courtry|8|7|61
3|Roazhon Ultimate 2|Rennes|7|5|22
3|Roazhon Ultimate 3|Rennes|7|1|-29
3|Flying Bulots|Granville|7|4|-1
3|Krampouz|Lannion|7|4|6
3|Diskuizh|Brest|7|7|54
3|Hulc|Les Herbiers|7|3|-5
3|Power Rouengers 2|Rouen|7|1|-42
3|Ambarès Ultimate|Ambarès|8|6|22
3|Stade Bordelais 2|Bordeaux|8|4|12
3|Les Ours|Pau|8|5|20
3|T-R'Aix|Aix-en-Provence|8|0|-67
3|Aigles|Bègles|8|8|51
3|Les Phoques|Foix|8|3|-10
3|BTR 2|Toulouse|8|2|-18
3|Mosquidos|Villeurbanne|8|3|-2
3|Dahultimate|Seynod|8|5|10
3|Crazy Bees|Crest|8|6|14
3|Monkey 2|Grenoble|8|8|52
3|Shamrock|Arnas|8|0|-65
3|Ziggles|Nice|8|3|-6
3|Mandra|Avignon|8|3|6
3|Fumble|Veauche|8|4|-9
3|BlackBeast|Charleville|8|5|28
3|Rhinocéreims|Reims|8|4|23
3|Disctroyes|Torvilliers|8|0|-45
3|Ultimate Vibration|Cergy|8|6|22
3|Valois UC|Bargny|8|3|-8
3|Owl Curv|Villersexel|8|8|41
3|Saône X|Mâcon|8|2|-25`
const locations = {
  Pornichet:[47.26,-2.34], Bordeaux:[44.84,-0.58], Paris:[48.86,2.35], 'La Rochelle':[46.16,-1.15], 'Baillet-en-France':[49.06,2.3], Toulouse:[43.6,1.44], Grenoble:[45.19,5.72], Blois:[47.59,1.34], Angers:[47.47,-0.55], 'Noisy-le-Sec':[48.89,2.46], Nemours:[48.27,2.69], Créteil:[48.79,2.46], Nantes:[47.22,-1.55], 'Joué-lès-Tours':[47.35,0.66], Rennes:[48.11,-1.68], Montrouge:[48.82,2.32], Plaisir:[48.82,1.95], Rouen:[49.44,1.1], Besançon:[47.24,6.02], Villeurbanne:[45.77,4.88], Chambéry:[45.56,5.92], Strasbourg:[48.58,7.75], Dijon:[47.32,5.04], Marseille:[43.3,5.37], Montpellier:[43.61,3.88], Lyon:[45.76,4.84], 'La Roche-sur-Yon':[46.67,-1.43], Cognac:[45.7,-0.33], Challans:[46.85,-1.88], Versailles:[48.8,2.13], 'Le Mans':[48,0.2], 'La Chevrolière':[47.09,-1.61], 'Fontenay-le-Comte':[46.47,-0.81], Orléans:[47.9,1.91], Évry:[48.63,2.44], 'La Celle-Saint-Cloud':[48.85,2.15], 'Saint-Germain-en-Laye':[48.9,2.09], Courtry:[48.92,2.6], Granville:[48.84,-1.6], Lannion:[48.73,-3.46], Brest:[48.39,-4.49], 'Les Herbiers':[46.87,-1.01], Ambarès:[44.93,-0.49], Pau:[43.3,-0.37], 'Aix-en-Provence':[43.53,5.45], Bègles:[44.81,-0.55], Foix:[42.97,1.61], Seynod:[45.88,6.09], Crest:[44.73,5.02], Arnas:[46.02,4.71], Nice:[43.7,7.27], Avignon:[43.95,4.81], Veauche:[45.56,4.29], Charleville:[49.77,4.72], Reims:[49.26,4.03], Torvilliers:[48.27,3.96], Cergy:[49.04,2.06], Bargny:[49.2,2.92], Villersexel:[47.55,6.43], Mâcon:[46.31,4.83],
}
const key = name => name.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
export const FRANCE_CLUBS = rows.split('\n').map(row => {
  const [level,name,city,games,wins,diff] = row.split('|')
  const sourceTier = Number(level), winRate = Number(wins)/Number(games), diffPerGame = Number(diff)/Number(games)
  const parent = name.replace(/ [23]$/, '')
  return { id:`dom-fr-${key(name)}`, name, city, countryId:'fr', country:'France', sourceTier,
    coordinates:locations[city], parentClubId: parent !== name ? `dom-fr-${key(parent)}` : null,
    referenceResults:{ games:Number(games), wins:Number(wins), diff:Number(diff), sourceTier },
    strengthScore:(4-sourceTier)*100+winRate*70+diffPerGame*2,
    skillAdjustment:(2-sourceTier)*2+(winRate-0.5)*3+diffPerGame*0.12,
    provisionalIdentity:name === 'Freezgo 2', rawPlayers:[] }
})

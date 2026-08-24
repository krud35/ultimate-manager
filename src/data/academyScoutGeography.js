/**
 * Geografia skautingu młodzieżowego: kontynent -> (dla Europy: region) -> kraj, plus
 * pula imion/nazwisk per kraj i ukryty modyfikator "siły" ultimate w danym kraju
 * (0-100, wpływa na szansę trafienia lepszego pasma OVR — patrz `rollProspectOvrBand`
 * w `career/academy.js`). Lista 43 krajów i regiony Europy wg wyboru użytkownika;
 * wartości `strength` to świadoma, przybliżona ocena, nie twardy ranking WFDF — dla
 * krajów pokrywających się z `data/eucs/eucsCountryStrength.js` (osobny, węższy rejestr
 * dla realnych klubów EUCS) używane są te same liczby dla spójności.
 */

export const ACADEMY_CONTINENTS = [
  { id: 'europe', labelPl: 'Europa', labelEn: 'Europe' },
  { id: 'northAmerica', labelPl: 'Ameryka Północna', labelEn: 'North America' },
  { id: 'southAmerica', labelPl: 'Ameryka Południowa', labelEn: 'South America' },
  { id: 'africa', labelPl: 'Afryka', labelEn: 'Africa' },
  { id: 'asia', labelPl: 'Azja', labelEn: 'Asia' },
  { id: 'oceania', labelPl: 'Australia i Oceania', labelEn: 'Australia & Oceania' },
]

export const ACADEMY_EUROPE_REGIONS = [
  {
    id: 'northernEurope',
    labelPl: 'Europa Północna',
    labelEn: 'Northern Europe',
    countries: ['gb', 'ie', 'dk', 'fi', 'no'],
  },
  {
    id: 'westernEurope',
    labelPl: 'Europa Zachodnia',
    labelEn: 'Western Europe',
    countries: ['fr', 'be', 'ch', 'de', 'at'],
  },
  {
    id: 'southernEurope',
    labelPl: 'Europa Południowa',
    labelEn: 'Southern Europe',
    countries: ['pt', 'es', 'it', 'si', 'hr', 'gr'],
  },
  {
    id: 'easternEurope',
    labelPl: 'Europa Wschodnia',
    labelEn: 'Eastern Europe',
    countries: ['pl', 'cz', 'sk', 'hu', 'ua', 'bg'],
  },
]

export const ACADEMY_COUNTRIES = {
  gb: { continent: 'europe', labelPl: 'Wielka Brytania', labelEn: 'United Kingdom', nameEn: 'Great Britain', strength: 78 },
  ie: { continent: 'europe', labelPl: 'Irlandia', labelEn: 'Ireland', nameEn: 'Ireland', strength: 74 },
  pt: { continent: 'europe', labelPl: 'Portugalia', labelEn: 'Portugal', nameEn: 'Portugal', strength: 35 },
  es: { continent: 'europe', labelPl: 'Hiszpania', labelEn: 'Spain', nameEn: 'Spain', strength: 42 },
  fr: { continent: 'europe', labelPl: 'Francja', labelEn: 'France', nameEn: 'France', strength: 60 },
  be: { continent: 'europe', labelPl: 'Belgia', labelEn: 'Belgium', nameEn: 'Belgium', strength: 75 },
  ch: { continent: 'europe', labelPl: 'Szwajcaria', labelEn: 'Switzerland', nameEn: 'Switzerland', strength: 72 },
  de: { continent: 'europe', labelPl: 'Niemcy', labelEn: 'Germany', nameEn: 'Germany', strength: 82 },
  at: { continent: 'europe', labelPl: 'Austria', labelEn: 'Austria', nameEn: 'Austria', strength: 55 },
  it: { continent: 'europe', labelPl: 'Włochy', labelEn: 'Italy', nameEn: 'Italy', strength: 66 },
  si: { continent: 'europe', labelPl: 'Słowenia', labelEn: 'Slovenia', nameEn: 'Slovenia', strength: 45 },
  cz: { continent: 'europe', labelPl: 'Czechy', labelEn: 'Czech Republic', nameEn: 'Czech Republic', strength: 68 },
  sk: { continent: 'europe', labelPl: 'Słowacja', labelEn: 'Slovakia', nameEn: 'Slovakia', strength: 32 },
  pl: { continent: 'europe', labelPl: 'Polska', labelEn: 'Poland', nameEn: 'Poland', strength: 52 },
  ua: { continent: 'europe', labelPl: 'Ukraina', labelEn: 'Ukraine', nameEn: 'Ukraine', strength: 40 },
  bg: { continent: 'europe', labelPl: 'Bułgaria', labelEn: 'Bulgaria', nameEn: 'Bulgaria', strength: 20 },
  hu: { continent: 'europe', labelPl: 'Węgry', labelEn: 'Hungary', nameEn: 'Hungary', strength: 38 },
  dk: { continent: 'europe', labelPl: 'Dania', labelEn: 'Denmark', nameEn: 'Denmark', strength: 58 },
  fi: { continent: 'europe', labelPl: 'Finlandia', labelEn: 'Finland', nameEn: 'Finland', strength: 95 },
  no: { continent: 'europe', labelPl: 'Norwegia', labelEn: 'Norway', nameEn: 'Norway', strength: 50 },
  hr: { continent: 'europe', labelPl: 'Chorwacja', labelEn: 'Croatia', nameEn: 'Croatia', strength: 42 },
  gr: { continent: 'europe', labelPl: 'Grecja', labelEn: 'Greece', nameEn: 'Greece', strength: 25 },

  us: { continent: 'northAmerica', labelPl: 'USA', labelEn: 'USA', nameEn: 'United States', strength: 98 },
  ca: { continent: 'northAmerica', labelPl: 'Kanada', labelEn: 'Canada', nameEn: 'Canada', strength: 80 },
  mx: { continent: 'northAmerica', labelPl: 'Meksyk', labelEn: 'Mexico', nameEn: 'Mexico', strength: 30 },

  co: { continent: 'southAmerica', labelPl: 'Kolumbia', labelEn: 'Colombia', nameEn: 'Colombia', strength: 70 },
  ar: { continent: 'southAmerica', labelPl: 'Argentyna', labelEn: 'Argentina', nameEn: 'Argentina', strength: 45 },
  br: { continent: 'southAmerica', labelPl: 'Brazylia', labelEn: 'Brazil', nameEn: 'Brazil', strength: 40 },
  py: { continent: 'southAmerica', labelPl: 'Paragwaj', labelEn: 'Paraguay', nameEn: 'Paraguay', strength: 25 },
  ve: { continent: 'southAmerica', labelPl: 'Wenezuela', labelEn: 'Venezuela', nameEn: 'Venezuela', strength: 30 },
  cl: { continent: 'southAmerica', labelPl: 'Chile', labelEn: 'Chile', nameEn: 'Chile', strength: 35 },
  pe: { continent: 'southAmerica', labelPl: 'Peru', labelEn: 'Peru', nameEn: 'Peru', strength: 25 },

  eg: { continent: 'africa', labelPl: 'Egipt', labelEn: 'Egypt', nameEn: 'Egypt', strength: 20 },
  ma: { continent: 'africa', labelPl: 'Maroko', labelEn: 'Morocco', nameEn: 'Morocco', strength: 18 },
  za: { continent: 'africa', labelPl: 'RPA', labelEn: 'South Africa', nameEn: 'South Africa', strength: 35 },

  cn: { continent: 'asia', labelPl: 'Chiny', labelEn: 'China', nameEn: 'China', strength: 30 },
  jp: { continent: 'asia', labelPl: 'Japonia', labelEn: 'Japan', nameEn: 'Japan', strength: 55 },
  ph: { continent: 'asia', labelPl: 'Filipiny', labelEn: 'Philippines', nameEn: 'Philippines', strength: 25 },
  tw: { continent: 'asia', labelPl: 'Tajwan', labelEn: 'Taiwan', nameEn: 'Taiwan', strength: 30 },
  sg: { continent: 'asia', labelPl: 'Singapur', labelEn: 'Singapore', nameEn: 'Singapore', strength: 28 },
  hk: { continent: 'asia', labelPl: 'Hong Kong', labelEn: 'Hong Kong', nameEn: 'Hong Kong', strength: 32 },

  au: { continent: 'oceania', labelPl: 'Australia', labelEn: 'Australia', nameEn: 'Australia', strength: 88 },
  nz: { continent: 'oceania', labelPl: 'Nowa Zelandia', labelEn: 'New Zealand', nameEn: 'New Zealand', strength: 60 },
}

export const ACADEMY_NATIONALITY_NAMES = {
  gb: {
    firstNames: ['Oliver', 'George', 'Harry', 'Jack', 'Charlie', 'Thomas', 'Freddie', 'Archie', 'Alfie', 'James', 'Oscar', 'Henry', 'William', 'Joshua'],
    lastNames: ['Smith', 'Jones', 'Taylor', 'Brown', 'Evans', 'Wilson', 'Thomas', 'Roberts', 'Walker', 'Wright', 'Robinson', 'Hughes', 'Green', 'Baker'],
  },
  ie: {
    firstNames: ['Conor', 'Sean', 'Cian', 'Oisin', 'Fionn', 'Darragh', 'Ronan', 'Eoin', 'Cathal', 'Padraig', 'Niall', 'Rory', 'Tadhg', 'Liam'],
    lastNames: ['Murphy', 'Kelly', "O'Sullivan", 'Walsh', 'Byrne', 'Ryan', "O'Brien", "O'Connor", 'McCarthy', 'Gallagher', 'Doyle', 'Kennedy', 'Lynch', 'Fitzgerald'],
  },
  pt: {
    firstNames: ['Joao', 'Miguel', 'Tiago', 'Rui', 'Bruno', 'Diogo', 'Andre', 'Rodrigo', 'Goncalo', 'Nuno', 'Pedro', 'Vasco', 'Duarte', 'Afonso'],
    lastNames: ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Costa', 'Rodrigues', 'Martins', 'Carvalho', 'Gomes', 'Fernandes', 'Ribeiro', 'Alves', 'Monteiro', 'Cardoso'],
  },
  es: {
    firstNames: ['Alejandro', 'Pablo', 'Javier', 'Sergio', 'Adrian', 'Hugo', 'Mario', 'Diego', 'Alvaro', 'Ivan', 'Marcos', 'Ruben', 'Gonzalo', 'Nico'],
    lastNames: ['Garcia', 'Martinez', 'Lopez', 'Sanchez', 'Perez', 'Gomez', 'Fernandez', 'Ruiz', 'Diaz', 'Moreno', 'Alonso', 'Romero', 'Navarro', 'Torres'],
  },
  fr: {
    firstNames: ['Lucas', 'Hugo', 'Louis', 'Nathan', 'Gabriel', 'Mathis', 'Thomas', 'Antoine', 'Maxime', 'Julien', 'Baptiste', 'Theo', 'Quentin', 'Remi'],
    lastNames: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefevre', 'Roux', 'David'],
  },
  be: {
    firstNames: ['Thibault', 'Arthur', 'Louis', 'Victor', 'Maxime', 'Lucas', 'Noah', 'Simon', 'Vincent', 'Wout', 'Bram', 'Sander', 'Kobe', 'Jef'],
    lastNames: ['Peeters', 'Janssens', 'Maes', 'Jacobs', 'Willems', 'Claes', 'Goossens', 'Wouters', 'De Smet', 'Dubois', 'Lambert', 'Michiels', 'Hermans', 'Mertens'],
  },
  ch: {
    firstNames: ['Luca', 'Noah', 'Elias', 'Julian', 'Nico', 'Fabian', 'Yannick', 'Livio', 'Sven', 'Timo', 'Reto', 'Silvan', 'Joel', 'Marco'],
    lastNames: ['Muller', 'Meier', 'Schmid', 'Keller', 'Weber', 'Huber', 'Schneider', 'Meyer', 'Steiner', 'Fischer', 'Gerber', 'Brunner', 'Baumann', 'Zimmermann'],
  },
  de: {
    firstNames: ['Lukas', 'Finn', 'Elias', 'Jonas', 'Paul', 'Felix', 'Leon', 'Max', 'Moritz', 'Tim', 'Niklas', 'Jan', 'Julian', 'Simon'],
    lastNames: ['Muller', 'Schmidt', 'Schneider', 'Fischer', 'Weber', 'Meyer', 'Wagner', 'Becker', 'Hoffmann', 'Schulz', 'Koch', 'Bauer', 'Richter', 'Klein'],
  },
  at: {
    firstNames: ['Lukas', 'Florian', 'Maximilian', 'Matthias', 'Sebastian', 'Daniel', 'Stefan', 'Andreas', 'Michael', 'Tobias', 'Bernhard', 'Christoph', 'Gregor', 'Manuel'],
    lastNames: ['Gruber', 'Huber', 'Bauer', 'Wagner', 'Muller', 'Pichler', 'Steiner', 'Moser', 'Mayer', 'Hofer', 'Leitner', 'Berger', 'Fuchs', 'Winkler'],
  },
  it: {
    firstNames: ['Marco', 'Luca', 'Matteo', 'Andrea', 'Alessandro', 'Davide', 'Simone', 'Federico', 'Lorenzo', 'Riccardo', 'Giacomo', 'Francesco', 'Tommaso', 'Nicolo'],
    lastNames: ['Rossi', 'Russo', 'Ferrari', 'Esposito', 'Bianchi', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'Deluca'],
  },
  si: {
    firstNames: ['Jan', 'Luka', 'Miha', 'Anze', 'Tilen', 'Ziga', 'Nejc', 'Rok', 'Matic', 'Bostjan', 'Jure', 'Blaz', 'Klemen', 'Domen'],
    lastNames: ['Novak', 'Horvat', 'Krajnc', 'Zupancic', 'Potocnik', 'Kovacic', 'Vidmar', 'Kos', 'Golob', 'Kastelic', 'Turk', 'Bizjak', 'Petek', 'Mlakar'],
  },
  cz: {
    firstNames: ['Jakub', 'Jan', 'Tomas', 'Adam', 'Matej', 'Vojtech', 'Filip', 'Ondrej', 'David', 'Lukas', 'Marek', 'Petr', 'Vaclav', 'Radek'],
    lastNames: ['Novak', 'Svoboda', 'Novotny', 'Dvorak', 'Cerny', 'Prochazka', 'Kucera', 'Vesely', 'Horak', 'Nemec', 'Marek', 'Pokorny', 'Kral', 'Sedlacek'],
  },
  sk: {
    firstNames: ['Jakub', 'Samuel', 'Adam', 'Matej', 'Tomas', 'Filip', 'Martin', 'Lukas', 'Michal', 'Patrik', 'Marek', 'Dominik', 'Peter', 'Erik'],
    lastNames: ['Horvath', 'Kovac', 'Varga', 'Baláž', 'Simko', 'Novak', 'Kovacik', 'Bartos', 'Danko', 'Molnar', 'Urban', 'Palko', 'Sabo', 'Toth'],
  },
  pl: {
    firstNames: ['Jakub', 'Kacper', 'Filip', 'Wojciech', 'Szymon', 'Bartosz', 'Mateusz', 'Michal', 'Adam', 'Piotr', 'Tomasz', 'Krzysztof', 'Marcin', 'Pawel'],
    lastNames: ['Nowak', 'Kowalski', 'Wisniewski', 'Wojcik', 'Kowalczyk', 'Kaminski', 'Lewandowski', 'Zielinski', 'Szymanski', 'Wozniak', 'Dabrowski', 'Kozlowski', 'Jankowski', 'Mazur'],
  },
  ua: {
    firstNames: ['Andriy', 'Oleksandr', 'Dmytro', 'Mykola', 'Vitaliy', 'Serhiy', 'Taras', 'Bohdan', 'Yaroslav', 'Ivan', 'Roman', 'Maksym', 'Denys', 'Vasyl'],
    lastNames: ['Shevchenko', 'Kovalenko', 'Boyko', 'Bondarenko', 'Tkachenko', 'Kravchenko', 'Kovalchuk', 'Melnyk', 'Moroz', 'Ponomarenko', 'Rudenko', 'Marchenko', 'Lysenko', 'Savchenko'],
  },
  bg: {
    firstNames: ['Georgi', 'Ivan', 'Dimitar', 'Nikolay', 'Stoyan', 'Petar', 'Todor', 'Hristo', 'Kaloyan', 'Aleksandar', 'Yordan', 'Boris', 'Plamen', 'Emil'],
    lastNames: ['Ivanov', 'Georgiev', 'Dimitrov', 'Petrov', 'Nikolov', 'Todorov', 'Hristov', 'Stoyanov', 'Angelov', 'Kolev', 'Vasilev', 'Iliev', 'Marinov', 'Yordanov'],
  },
  hu: {
    firstNames: ['Balazs', 'Gabor', 'Zoltan', 'Andras', 'Peter', 'Tamas', 'Laszlo', 'Attila', 'Csaba', 'Marton', 'Bence', 'Daniel', 'Gergo', 'Levente'],
    lastNames: ['Nagy', 'Kovacs', 'Toth', 'Szabo', 'Horvath', 'Varga', 'Kiss', 'Molnar', 'Nemeth', 'Farkas', 'Balogh', 'Papp', 'Takacs', 'Juhasz'],
  },
  dk: {
    firstNames: ['Mikkel', 'Mads', 'Frederik', 'Anders', 'Christian', 'Lasse', 'Emil', 'Jonas', 'Nikolaj', 'Rasmus', 'Simon', 'Magnus', 'Oscar', 'Sebastian'],
    lastNames: ['Nielsen', 'Jensen', 'Hansen', 'Andersen', 'Pedersen', 'Christensen', 'Larsen', 'Sorensen', 'Rasmussen', 'Jorgensen', 'Petersen', 'Madsen', 'Kristensen', 'Olsen'],
  },
  fi: {
    firstNames: ['Mikko', 'Juho', 'Ville', 'Antti', 'Aleksi', 'Joni', 'Sami', 'Tuomas', 'Otto', 'Eetu', 'Niko', 'Kalle', 'Jere', 'Onni'],
    lastNames: ['Korhonen', 'Virtanen', 'Makinen', 'Nieminen', 'Makela', 'Hamalainen', 'Laine', 'Heikkinen', 'Koskinen', 'Jarvinen', 'Lehtonen', 'Lehtinen', 'Saarinen', 'Salminen'],
  },
  no: {
    firstNames: ['Magnus', 'Jonas', 'Kristian', 'Henrik', 'Sander', 'Andreas', 'Fredrik', 'Martin', 'Erik', 'Oskar', 'Tobias', 'Elias', 'Emil', 'Sindre'],
    lastNames: ['Hansen', 'Johansen', 'Olsen', 'Larsen', 'Andersen', 'Pedersen', 'Nilsen', 'Kristiansen', 'Jensen', 'Karlsen', 'Berg', 'Haugen', 'Solberg', 'Dahl'],
  },
  hr: {
    firstNames: ['Ivan', 'Marko', 'Luka', 'Ante', 'Josip', 'Filip', 'Karlo', 'Toni', 'Petar', 'Domagoj', 'Tomislav', 'Mateo', 'Nikola', 'Bruno'],
    lastNames: ['Horvat', 'Kovacevic', 'Babic', 'Maric', 'Jurić', 'Novak', 'Kovac', 'Kovacic', 'Vukovic', 'Matic', 'Peric', 'Knezevic', 'Grgic', 'Blazevic'],
  },
  gr: {
    firstNames: ['Yiannis', 'Dimitris', 'Nikos', 'Kostas', 'Giorgos', 'Panos', 'Vasilis', 'Christos', 'Andreas', 'Stavros', 'Alexandros', 'Michalis', 'Petros', 'Thanos'],
    lastNames: ['Papadopoulos', 'Papadakis', 'Papadimitriou', 'Georgiou', 'Nikolaou', 'Ioannou', 'Antoniou', 'Vlachos', 'Katsaros', 'Christodoulou', 'Dimitriou', 'Karagiannis', 'Konstantinou', 'Pappas'],
  },

  us: {
    firstNames: ['Ryan', 'Tyler', 'Dylan', 'Cole', 'Jack', 'Cameron', 'Brady', 'Trevor', 'Austin', 'Chase', 'Garrett', 'Colton', 'Hunter', 'Mason'],
    lastNames: ['Johnson', 'Williams', 'Miller', 'Davis', 'Anderson', 'Thompson', 'Moore', 'Jackson', 'Martin', 'White', 'Harris', 'Clark', 'Lewis', 'Young'],
  },
  ca: {
    firstNames: ['Liam', 'Jacob', 'Ethan', 'Nathan', 'Carter', 'Owen', 'Wyatt', 'Jackson', 'Mathieu', 'Etienne', 'Gabriel', 'Alexandre', 'Marc', 'Simon'],
    lastNames: ['Tremblay', 'Gagnon', 'Roy', 'Cote', 'Bouchard', 'Fortin', 'MacDonald', 'Campbell', 'Wilson', 'Martin', 'Smith', 'Leblanc', 'Pelletier', 'Girard'],
  },
  mx: {
    firstNames: ['Santiago', 'Mateo', 'Emiliano', 'Diego', 'Leonardo', 'Angel', 'Sebastian', 'Alejandro', 'Rodrigo', 'Fernando', 'Gael', 'Ricardo', 'Eduardo', 'Ivan'],
    lastNames: ['Hernandez', 'Garcia', 'Martinez', 'Gonzalez', 'Rodriguez', 'Perez', 'Sanchez', 'Ramirez', 'Torres', 'Flores', 'Vazquez', 'Morales', 'Reyes', 'Cruz'],
  },
  co: {
    firstNames: ['Santiago', 'Juan', 'Andres', 'Camilo', 'Sebastian', 'Nicolas', 'David', 'Felipe', 'Julian', 'Esteban', 'Alejandro', 'Mateo', 'Daniel', 'Miguel'],
    lastNames: ['Gomez', 'Rodriguez', 'Martinez', 'Lopez', 'Gonzalez', 'Ramirez', 'Torres', 'Diaz', 'Moreno', 'Castro', 'Ortiz', 'Rojas', 'Valencia', 'Correa'],
  },
  ar: {
    firstNames: ['Santiago', 'Mateo', 'Lucas', 'Tomas', 'Facundo', 'Nicolas', 'Franco', 'Ignacio', 'Agustin', 'Joaquin', 'Bruno', 'Gonzalo', 'Martin', 'Federico'],
    lastNames: ['Gonzalez', 'Rodriguez', 'Fernandez', 'Lopez', 'Martinez', 'Perez', 'Garcia', 'Sanchez', 'Romero', 'Alvarez', 'Torres', 'Ruiz', 'Diaz', 'Acosta'],
  },
  br: {
    firstNames: ['Lucas', 'Gabriel', 'Pedro', 'Matheus', 'Guilherme', 'Rafael', 'Bruno', 'Felipe', 'Thiago', 'Joao', 'Vinicius', 'Leonardo', 'Gustavo', 'Eduardo'],
    lastNames: ['Silva', 'Santos', 'Oliveira', 'Souza', 'Pereira', 'Costa', 'Rodrigues', 'Almeida', 'Nascimento', 'Carvalho', 'Araujo', 'Ribeiro', 'Barbosa', 'Freitas'],
  },
  py: {
    firstNames: ['Diego', 'Gustavo', 'Ramon', 'Fabian', 'Ruben', 'Cristian', 'Ariel', 'Nestor', 'Marcelo', 'Hugo', 'Ivan', 'Oscar', 'Victor', 'Sergio'],
    lastNames: ['Gonzalez', 'Benitez', 'Cabrera', 'Ortiz', 'Ferreira', 'Ayala', 'Rojas', 'Duarte', 'Cardozo', 'Mendoza', 'Villalba', 'Gimenez', 'Ovelar', 'Ruiz Diaz'],
  },
  ve: {
    firstNames: ['Jose', 'Carlos', 'Luis', 'Miguel', 'Jesus', 'Gabriel', 'Daniel', 'Alejandro', 'Rafael', 'Angel', 'Victor', 'Manuel', 'Andres', 'Cesar'],
    lastNames: ['Rodriguez', 'Gonzalez', 'Hernandez', 'Perez', 'Martinez', 'Sanchez', 'Ramirez', 'Torres', 'Diaz', 'Castillo', 'Marquez', 'Rojas', 'Mendoza', 'Suarez'],
  },
  cl: {
    firstNames: ['Matias', 'Benjamin', 'Vicente', 'Cristobal', 'Tomas', 'Diego', 'Ignacio', 'Joaquin', 'Martin', 'Felipe', 'Nicolas', 'Sebastian', 'Agustin', 'Gaspar'],
    lastNames: ['Gonzalez', 'Munoz', 'Rojas', 'Diaz', 'Perez', 'Soto', 'Silva', 'Fuentes', 'Contreras', 'Sepulveda', 'Morales', 'Torres', 'Reyes', 'Araya'],
  },
  pe: {
    firstNames: ['Diego', 'Jose', 'Luis', 'Carlos', 'Fernando', 'Alonso', 'Renzo', 'Sebastian', 'Piero', 'Gianmarco', 'Jhon', 'Andre', 'Kevin', 'Cristhian'],
    lastNames: ['Garcia', 'Rodriguez', 'Gonzalez', 'Fernandez', 'Flores', 'Vargas', 'Chavez', 'Quispe', 'Mendoza', 'Rojas', 'Castillo', 'Torres', 'Ramos', 'Huaman'],
  },

  eg: {
    firstNames: ['Ahmed', 'Mohamed', 'Omar', 'Youssef', 'Karim', 'Amr', 'Khaled', 'Mahmoud', 'Hassan', 'Tarek', 'Sherif', 'Adham', 'Wael', 'Islam'],
    lastNames: ['Hassan', 'Mahmoud', 'Ibrahim', 'Ali', 'Mostafa', 'Abdel Rahman', 'Fathy', 'El Sayed', 'Aziz', 'Kamal', 'Sabry', 'Fouad', 'Nasser', 'Farouk'],
  },
  ma: {
    firstNames: ['Youssef', 'Ayoub', 'Amine', 'Ismail', 'Anas', 'Zakaria', 'Mehdi', 'Reda', 'Hamza', 'Yassine', 'Adam', 'Othmane', 'Karim', 'Bilal'],
    lastNames: ['El Amrani', 'Bennani', 'Alaoui', 'Idrissi', 'Chraibi', 'Benjelloun', 'Fassi', 'Berrada', 'Tazi', 'Lahlou', 'Sqalli', 'Ouazzani', 'Kabbaj', 'Cherkaoui'],
  },
  za: {
    firstNames: ['Sipho', 'Thabo', 'Lwazi', 'Kagiso', 'Tshepo', 'Bongani', 'Jaco', 'Pieter', 'Ryan', 'Michael', 'Lucas', 'Themba', 'Sizwe', 'Andries'],
    lastNames: ['Nkosi', 'Dlamini', 'Khumalo', 'Mokoena', 'Botha', 'Van der Merwe', 'Pretorius', 'Naidoo', 'Ndlovu', 'Fourie', 'Venter', 'Mahlangu', 'Steyn', 'Sithole'],
  },

  cn: {
    firstNames: ['Wei', 'Jun', 'Hao', 'Lei', 'Chen', 'Tao', 'Jian', 'Feng', 'Yong', 'Bo', 'Peng', 'Qiang', 'Yang', 'Ming'],
    lastNames: ['Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao', 'Wu', 'Zhou', 'Xu', 'Sun', 'Ma', 'Zhu'],
  },
  jp: {
    firstNames: ['Haruto', 'Yuto', 'Sota', 'Riku', 'Kaito', 'Ren', 'Yuki', 'Sho', 'Daiki', 'Kenta', 'Takumi', 'Ryota', 'Hiroto', 'Sora'],
    lastNames: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Matsumoto'],
  },
  ph: {
    firstNames: ['Miguel', 'Jose', 'Juan', 'Carlo', 'Paolo', 'Angelo', 'Marco', 'Rafael', 'Gabriel', 'Enzo', 'Diego', 'Iñigo', 'Emmanuel', 'Joshua'],
    lastNames: ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Torres', 'Ramos', 'Mendoza', 'Castillo', 'Villanueva', 'Del Rosario', 'Aquino', 'Gonzales', 'Fernandez'],
  },
  tw: {
    firstNames: ['Chih-Hao', 'Wei-Ting', 'Chun-Yu', 'Ming-Han', 'Jia-Hong', 'Yu-Chen', 'Zhi-Qiang', 'Jun-Wei', 'Kai-Wen', 'Cheng-Yu', 'Yi-Jun', 'Po-Wei', 'Sheng-Han', 'Tzu-Hao'],
    lastNames: ['Chen', 'Lin', 'Huang', 'Chang', 'Wu', 'Liu', 'Tsai', 'Yang', 'Hsu', 'Chu', 'Kuo', 'Cheng', 'Hsieh', 'Wong'],
  },
  sg: {
    firstNames: ['Wei Jie', 'Jun Hao', 'Kai Xuan', 'Zhi Wei', 'Jia Le', 'Ryan', 'Marcus', 'Aaron', 'Daryl', 'Jerome', 'Wei Ming', 'Kenneth', 'Nicholas', 'Xavier'],
    lastNames: ['Tan', 'Lim', 'Lee', 'Ng', 'Wong', 'Goh', 'Ong', 'Teo', 'Chua', 'Koh', 'Yeo', 'Chan', 'Sim', 'Tay'],
  },
  hk: {
    firstNames: ['Ka Ho', 'Chun Hei', 'Tsz Fung', 'Cheuk Yin', 'Ho Yin', 'Kai Chun', 'Man Hei', 'Wing Hong', 'Yat Long', 'Hoi Ting', 'Ka Fai', 'Chi Wai', 'Long Fung', 'Ming Yeung'],
    lastNames: ['Chan', 'Wong', 'Lee', 'Cheung', 'Lau', 'Ho', 'Lam', 'Ng', 'Leung', 'Yeung', 'Chow', 'Fung', 'Tang', 'Kwok'],
  },

  au: {
    firstNames: ['Jack', 'Oliver', 'William', 'Lachlan', 'Noah', 'Ethan', 'Cooper', 'Hunter', 'Angus', 'Harrison', 'Riley', 'Xavier', 'Flynn', 'Zach'],
    lastNames: ['Smith', 'Jones', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Anderson', 'Thompson', 'White', 'Walker', 'Robinson', 'Mitchell', 'Campbell', 'Clarke'],
  },
  nz: {
    firstNames: ['Jack', 'Liam', 'James', 'Cameron', 'Ethan', 'Riley', 'Connor', 'Mitchell', 'Tama', 'Nikau', 'Manaia', 'Rawiri', 'Caleb', 'Isaac'],
    lastNames: ['Smith', 'Williams', 'Brown', 'Wilson', 'Taylor', 'Anderson', 'Thompson', 'Walker', 'Ngata', 'Wiremu', 'Parata', 'Henare', 'Mitchell', 'Robertson'],
  },
}

const GENERIC_FIRST_NAMES = [
  'Alex', 'Jordan', 'Casey', 'Riley', 'Morgan', 'Quinn', 'Avery', 'Cameron', 'Drew', 'Jamie',
]
const GENERIC_LAST_NAMES = [
  'Brooks', 'Hayes', 'Reed', 'Cole', 'Bennett', 'Foster', 'Griffin', 'Harper', 'Lane', 'West',
]

let byEnglishNameCache = null
function byEnglishName() {
  if (!byEnglishNameCache) {
    byEnglishNameCache = Object.fromEntries(
      Object.entries(ACADEMY_COUNTRIES).map(([id, entry]) => [entry.nameEn, { id, ...entry }]),
    )
  }
  return byEnglishNameCache
}

export function academyContinentLabel(continentId, lang = 'pl') {
  const continent = ACADEMY_CONTINENTS.find((c) => c.id === continentId)
  if (!continent) return continentId ?? ''
  return lang === 'en' ? continent.labelEn : continent.labelPl
}

export function academyCountryLabel(countryId, lang = 'pl') {
  const country = ACADEMY_COUNTRIES[countryId]
  if (!country) return countryId ?? ''
  return lang === 'en' ? country.labelEn : country.labelPl
}

export function academyCountriesForContinent(continentId) {
  return Object.entries(ACADEMY_COUNTRIES)
    .filter(([, entry]) => entry.continent === continentId)
    .map(([id, entry]) => ({ id, ...entry }))
}

export function academyEuropeRegionCountries(europeRegionId) {
  const region = ACADEMY_EUROPE_REGIONS.find((r) => r.id === europeRegionId)
  if (!region) return []
  return region.countries.map((id) => ({ id, ...ACADEMY_COUNTRIES[id] }))
}

export function academyCountryStrength(countryId) {
  return ACADEMY_COUNTRIES[countryId]?.strength ?? 50
}

/** Mostek do `player.nationality` (pełna angielska nazwa) — używane też poza akademią. */
export function academyCountryByEnglishName(name) {
  if (!name) return null
  return byEnglishName()[name] ?? null
}

function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

export function pickAcademyName(rng, countryId) {
  const pool = ACADEMY_NATIONALITY_NAMES[countryId]
  if (!pool) return { firstName: pick(rng, GENERIC_FIRST_NAMES), lastName: pick(rng, GENERIC_LAST_NAMES) }
  return { firstName: pick(rng, pool.firstNames), lastName: pick(rng, pool.lastNames) }
}

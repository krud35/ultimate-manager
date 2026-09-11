import { UI_LANG } from '../locale'

const pl = {
  welcomeBody: (managerName, teamName) =>
    `Witaj, ${managerName}! Pora zacząć Twój pierwszy sezon w ${teamName} — czy chcesz, żebym pokazał Ci co i jak?`,
  yes: 'Tak, pokaż mi',
  no: 'Nie, dam sobie radę',
  tutorialTitle: 'Jak grać w Ultimate Manager',
  tutorialSubtitle: 'Krótki przewodnik po ekranach gry — możesz go w każdej chwili zamknąć.',
  tips: 'Wskazówki',
  close: 'Zamknij',
  gotIt: 'Rozumiem, zaczynajmy',
}

const en = {
  welcomeBody: (managerName, teamName) =>
    `Welcome, ${managerName}! Time to start your first season with ${teamName} — want a quick tour of what's what?`,
  yes: 'Yes, show me',
  no: "No, I've got this",
  tutorialTitle: 'How to play Ultimate Manager',
  tutorialSubtitle: "A short tour of the game's screens — close it whenever you like.",
  tips: 'Tips',
  close: 'Close',
  gotIt: "Got it, let's go",
}

const BY_LANG = {
  [UI_LANG.PL]: pl,
  [UI_LANG.EN]: en,
}

export function onboardingStrings(lang) {
  return BY_LANG[lang] ?? pl
}

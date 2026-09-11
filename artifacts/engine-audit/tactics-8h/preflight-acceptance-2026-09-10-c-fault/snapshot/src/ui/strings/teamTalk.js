import { pickDict, UI_LANG } from '../locale'

const pl = {
  preTitle: 'Szatnia — przed meczem',
  preHint: 'Powiedz coś drużynie przed wyjściem na boisko.',
  postTitleWin: 'Szatnia — po zwycięstwie',
  postTitleLoss: 'Szatnia — po porażce',
  postTitleDraw: 'Szatnia — po meczu',
  tierLeader: 'Liderzy zespołu',
  tierInfluential: 'Zawodnicy wpływowi',
  tierOther: 'Pozostali zawodnicy',
  pickStatement: 'Wybierz, co powiesz drużynie:',
  skip: 'Pomiń',
  kickoffLabel: 'Rozpocznij mecz',
  continueLabel: 'Kontynuuj',
  reactionsTitle: 'Reakcje szatni',
  statementLocked: 'Powiedziane — nie da się cofnąć.',
}

const en = {
  preTitle: 'Dressing room — before kickoff',
  preHint: 'Say something to the team before you take the field.',
  postTitleWin: 'Dressing room — after the win',
  postTitleLoss: 'Dressing room — after the loss',
  postTitleDraw: 'Dressing room — post-match',
  tierLeader: 'Team leaders',
  tierInfluential: 'Influential players',
  tierOther: 'Other players',
  pickStatement: 'Choose what to tell the team:',
  skip: 'Skip',
  kickoffLabel: 'Kick off',
  continueLabel: 'Continue',
  reactionsTitle: 'Dressing room reactions',
  statementLocked: 'Said — no taking it back.',
}

export function teamTalkStrings(lang = UI_LANG.PL) {
  return pickDict({ pl, en }, lang)
}

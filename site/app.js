'use strict';

(() => {

/* Textes des exemples interactifs. Ces exemples illustrent les spécifications ;
   ils ne sont pas des rapports d'exécution de pi-495. */
const gates = [
  {
    "label": "G0 / CADRAGE",
    "title": "Cadrer le besoin et les décisions métier.",
    "description": "pi-495 distingue l’objectif, les contraintes et les questions qui changent la solution. Ce cadrage alimente le contexte des agents : périmètre autorisé, interfaces à préserver et décisions humaines enregistrées. Pour le client d’upload, il faut notamment fixer les erreurs réessayables et le nombre total de tentatives.",
    "artifact": "Mandat versionné : objectif, périmètre, contraintes et décisions métier.",
    "terminalLabel": "cadrage / client d’upload",
    "lines": [
      [
        "objectif",
        "Réessayer après une erreur temporaire"
      ],
      [
        "contrainte",
        "Préserver l’API publique"
      ],
      [
        "question",
        "Trois tentatives ou trois nouvelles tentatives ?"
      ],
      [
        "résultat",
        "Décision humaine enregistrée : trois tentatives au total."
      ]
    ]
  },
  {
    "label": "G1 / SPÉCIFICATION",
    "title": "Transformer le besoin en exigences vérifiables.",
    "description": "Le développement guidé par les spécifications relie chaque exigence à des critères d’acceptation observables et à son moyen de vérification. Les exigences sont identifiées et versionnées ; les scénarios couvrent le comportement nominal, les erreurs et les cas limites, en conservant les décisions du cadrage.",
    "artifact": "Exigences versionnées, scénarios d’acceptation et liens vers les contrôles.",
    "terminalLabel": "spécification / exemples de comportements",
    "lines": [
      [
        "REQ-01",
        "Erreur temporaire : nouvelle tentative après un délai croissant"
      ],
      [
        "REQ-02",
        "Au plus trois appels, premier appel compris"
      ],
      [
        "REQ-03",
        "Erreur définitive : un seul appel"
      ],
      [
        "traçabilité",
        "Chaque règle reprend une décision et possède un moyen de vérification."
      ]
    ]
  },
  {
    "label": "G2 / QUALIFICATION",
    "title": "Vérifier les contrôles, puis fixer le protocole.",
    "description": "Une préparation dédiée écrit les tests nécessaires. Ils doivent s’exécuter et atteindre les assertions attendues. Pour les règles complexes, on utilise TLA+ pour explorer les états et les enchaînements d’actions, et Lean pour démontrer des propriétés ciblées.",
    "artifact": "Tests qualifiés et protocole de vérification gelé.",
    "terminalLabel": "qualification / contrôle du nombre d’appels",
    "lines": [
      [
        "cas conforme",
        "Trois appels : le contrôle réussit"
      ],
      [
        "cas fautif",
        "Quatre appels : l’assertion détecte l’écart"
      ],
      [
        "incident",
        "Lanceur indisponible : aucun verdict métier"
      ],
      [
        "résultat",
        "Tests et critères protégés avant l’implémentation."
      ]
    ]
  },
  {
    "label": "G3 / CONCEPTION",
    "title": "Concevoir une solution reliée aux exigences.",
    "description": "La conception précise les responsabilités des modules, leurs dépendances et les interfaces à préserver. Le plan de tâches relie chaque modification aux exigences et aux contrôles attendus. Les choix techniques sont justifiés par les contraintes du projet ; une migration ajoute des règles de coexistence et un retour arrière.",
    "artifact": "Conception, choix techniques justifiés et plan de tâches traçable.",
    "terminalLabel": "conception / plan de réalisation",
    "lines": [
      [
        "responsabilité",
        "Distinguer erreurs temporaires et définitives"
      ],
      [
        "réalisation",
        "Ajouter la boucle bornée et le délai croissant"
      ],
      [
        "compatibilité",
        "Préserver l’API publique et vérifier les cas limites"
      ],
      [
        "traçabilité",
        "Chaque tâche indique les exigences et contrôles concernés."
      ]
    ]
  },
  {
    "label": "G4 / IMPLÉMENTATION",
    "title": "Implémenter avec des permissions contrôlées.",
    "description": "L’agent travaille dans une copie isolée, avec un contexte préparé pour son rôle et des permissions propres à la phase. Seatbelt sur macOS et bubblewrap sur Linux confinent ses actions. Il réalise les tâches et exécute ses vérifications ; les tests d’acceptation protégés restent hors de ses droits de modification.",
    "artifact": "Candidat identifié, inventaire des modifications et vérifications de l’agent.",
    "terminalLabel": "implémentation / observation du candidat",
    "lines": [
      [
        "confinement",
        "Seatbelt sur macOS ou bubblewrap sur Linux"
      ],
      [
        "modification",
        "Client d’upload : boucle de tentatives et temporisation"
      ],
      [
        "tests protégés",
        "Aucune modification par l’implémenteur"
      ],
      [
        "résultat",
        "Périmètre observé et candidat identifié pour les contrôles."
      ]
    ]
  },
  {
    "label": "G5 / ACCEPTATION",
    "title": "Confronter le code aux tests, aux revues et à la recette.",
    "description": "Le noyau exécute les contrôles sur le candidat exact. Selon la stack et le protocole, JaCoCo ou les rapports LCOV mesurent la couverture, PIT ou Stryker éprouvent les assertions par mutation, et fast-check vérifie des propriétés. La non-régression, les revues requises et la recette complètent ces contrôles ; un résultat manquant ou périmé bloque l’acceptation.",
    "artifact": "Rapports de contrôle, revues et recette rattachés au candidat exact.",
    "terminalLabel": "acceptation / résultats illustratifs",
    "lines": [
      [
        "fonctionnel",
        "Nombre d’appels, délais et erreurs conformes aux exigences"
      ],
      [
        "couverture / mutation",
        "Rapports qualifiés : JaCoCo ou LCOV ; PIT ou Stryker selon la stack"
      ],
      [
        "revue / recette",
        "Non-régression et obligations du protocole satisfaites"
      ],
      [
        "résultat",
        "Acceptation calculée par le noyau sur les résultats applicables."
      ]
    ]
  },
  {
    "label": "G6 / INTÉGRATION",
    "title": "Intégrer dans Git la version réellement vérifiée.",
    "description": "Une fois l’intégration activée et autorisée, pi-495 applique le candidat accepté au dépôt Git local. La comparaison de l’arbre intégré et des empreintes de contenu vérifie la correspondance avec le code contrôlé. Les rapports et décisions restent conservés dans un historique d’événements chaînés par empreinte.",
    "artifact": "Arbre Git conforme au candidat accepté et historique d’intégration vérifiable.",
    "terminalLabel": "intégration / contrôle final",
    "lines": [
      [
        "précondition",
        "Candidat accepté et intégration autorisée"
      ],
      [
        "action Git",
        "Appliquer les modifications au dépôt local"
      ],
      [
        "correspondance",
        "Arbre intégré et contenu conformes au candidat vérifié"
      ],
      [
        "historique",
        "Résultat d’intégration enregistré dans le dossier."
      ]
    ]
  }
];
const cases = [
  {label:'CRÉATION / DU SOCLE À LA RECETTE',title:'Décomposer le produit en incréments vérifiables.',description:'Les spécifications prévoient de partir d’un dépôt vierge : choisir la stack et l’architecture, vérifier le build et les tests, puis livrer les fonctionnalités par incréments. La recette globale vérifie les parcours utilisateur et les échanges entre composants.',steps:['Préparer un socle qui compile, démarre et exécute ses tests.','Affecter les exigences aux incréments et ordonner leurs dépendances.','Vérifier les API et les parcours de bout en bout aux jalons.'],insight:'Deux fonctionnalités testées séparément peuvent rester incompatibles une fois assemblées. La recette de l’application vérifie leur fonctionnement commun.'},
  {label:'ÉVOLUTION / COMPORTEMENTS ET NON-RÉGRESSION',title:'Ajouter ou corriger un comportement sans dégrader l’existant.',description:'pi-495 établit une référence, examine les contrôles disponibles et prépare ceux nécessaires au changement. Pour un legacy peu testé, le plan prévoit des tests de caractérisation avant transformation, en distinguant comportement observé et comportement voulu.',steps:['Exécuter les contrôles existants et identifier leurs angles morts.','Préparer les tests du changement et protéger les comportements légitimes.','Comparer le candidat à la référence pour distinguer régression et défaut hérité.'],insight:'Un bug déjà présent reste un écart à traiter. Le capturer dans un test de caractérisation ne doit pas en faire une règle métier.'},
  {label:'MODERNISATION / ARCHITECTURE ET DETTE TECHNIQUE',title:'Transformer le code par étapes avec des critères mesurables.',description:'Le parcours prévu compare l’architecture réelle à une cible justifiée par les contraintes du projet. Le référentiel qualité localise les écarts ; la trajectoire organise les corrections et les migrations, avec des règles de coexistence et un retour arrière.',steps:['Cartographier les modules, les dépendances et les écarts de qualité.','Adopter une cible et des étapes avec compatibilité, exceptions temporaires et retour arrière.','Mesurer chaque jalon et vérifier la non-régression ainsi que les dépendances restantes.'],insight:'Un total de défauts en baisse ne compense pas une nouvelle violation obligatoire. La cible doit être vérifiée sur le code intégré.'}
];
const scenarios = {
  valid:{facts:[['Version testée','révision A'],['Version à accepter','révision A'],['Contrôle obligatoire','PASS']],pass:true,title:'Résultat applicable',description:'Le rapport concerne la révision A et les contrôles prévus. L’acceptation reste soumise aux autres vérifications, revues et décisions requises.'},
  stale:{facts:[['Version testée','révision A'],['Version à accepter','révision B'],['Contrôle obligatoire','PASS sur A']],pass:false,title:'Acceptation bloquée : rapport périmé',description:'Le code a changé depuis l’exécution du test. La réussite sur A ne vérifie pas B : il faut produire un rapport applicable à la révision B.'},
  missing:{facts:[['Version testée','révision A'],['Version à accepter','révision A'],['Contrôle obligatoire','Aucun rapport']],pass:false,title:'Acceptation bloquée : contrôle manquant',description:'Le test obligatoire n’a pas fourni de résultat. La réussite des autres contrôles ne remplace pas cette vérification.'},
  incident:{facts:[['Version testée','révision A'],['Version à accepter','révision A'],['Contrôle obligatoire','Lanceur en erreur']],pass:false,title:'Acceptation bloquée : résultat indéterminé',description:'Le lanceur n’a pas atteint les assertions du test. Il faut résoudre l’incident et relancer le contrôle avant de juger le comportement du code.'}
};
window.pi495TranslateData([gates, cases, scenarios]);
const translate = window.pi495Translate;
const byId = id => document.getElementById(id);
const put = (id,value) => { byId(id).textContent=translate(value); };
let gateIndex=0;
function selectTab(selector,index) {
  document.querySelectorAll(selector).forEach((button,i)=>{
    button.setAttribute('aria-selected',String(i===index));
    button.tabIndex=i===index?0:-1;
  });
}
function renderGate(index) {
  gateIndex=index; const g=gates[index];
  selectTab('[data-gate]',index);
  byId('gate-panel').setAttribute('aria-labelledby','gate-tab-'+index);
  for (const field of ['label','title','description','artifact']) put('gate-'+field,g[field]);
  const terminal=byId('gate-terminal'); terminal.replaceChildren();
  const caption=document.createElement('div'); caption.className='terminal-label'; caption.textContent=g.terminalLabel; terminal.append(caption);
  g.lines.forEach(([label,text],i)=>{
    const p=document.createElement('p'); const s=document.createElement('span');
    s.className=i===3?'terminal-success':'terminal-accent'; s.textContent=label+' '; p.append(s,document.createTextNode(text)); terminal.append(p);
  });
}
function renderCase(index) {
  const c=cases[index]; selectTab('[data-case]',index);
  byId('case-panel').setAttribute('aria-labelledby','case-tab-'+index);
  for(const field of ['label','title','description','insight']) put('case-'+field,c[field]);
  byId('case-steps').replaceChildren(...c.steps.map((text,i)=>{
    const li=document.createElement('li'), span=document.createElement('span');
    span.textContent=String(i+1).padStart(2,'0'); li.append(span,document.createTextNode(text)); return li;
  }));
}
function renderScenario(key) {
  const s=scenarios[key];
  document.querySelectorAll('[data-scenario]').forEach(b=>{b.classList.toggle('selected',b.dataset.scenario===key);b.setAttribute('aria-pressed',String(b.dataset.scenario===key));});
  byId('verdict-facts').replaceChildren(...s.facts.map(([label,value])=>{
    const div=document.createElement('div'), dt=document.createElement('dt'), dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;div.append(dt,dd);return div;
  }));
  const result=byId('verdict-result');result.className='verdict-result '+(s.pass?'pass':'fail');
  const icon=document.createElement('span');icon.textContent=s.pass?'✓':'!';result.replaceChildren(icon,document.createTextNode(' '+s.title));put('verdict-description',s.description);
}
function wireTabs(selector,render) {
  const tabs=[...document.querySelectorAll(selector)];
  tabs.forEach((b,i)=>{
    b.addEventListener('click',()=>render(i));
    b.addEventListener('keydown',e=>{
      let next;
      if(e.key==='ArrowRight'||e.key==='ArrowDown')next=(i+1)%tabs.length;
      if(e.key==='ArrowLeft'||e.key==='ArrowUp')next=(i+tabs.length-1)%tabs.length;
      if(e.key==='Home')next=0;if(e.key==='End')next=tabs.length-1;
      if(next!==undefined){e.preventDefault();render(next);tabs[next].focus();}
    });
  });
}
wireTabs('[data-gate]',renderGate);wireTabs('[data-case]',renderCase);
byId('next-gate').addEventListener('click',()=>renderGate((gateIndex+1)%gates.length));
document.querySelectorAll('[data-scenario]').forEach(b=>b.addEventListener('click',()=>renderScenario(b.dataset.scenario)));
const themeButton=byId('theme-toggle');
const systemTheme=window.matchMedia('(prefers-color-scheme: light)');
function setTheme(theme){document.documentElement.dataset.theme=theme;document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='light'?'#ece9e3':'#141b24');themeButton.setAttribute('aria-label',translate(theme==='dark'?'Activer le thème clair':'Activer le thème sombre'));}
let savedTheme;
try{savedTheme=localStorage.getItem('pi495-theme');}catch{}
setTheme(savedTheme==='light'||savedTheme==='dark'?savedTheme:systemTheme.matches?'light':'dark');
systemTheme.addEventListener('change',event=>{let saved;try{saved=localStorage.getItem('pi495-theme');}catch{}if(saved!=='light'&&saved!=='dark')setTheme(event.matches?'light':'dark');});
themeButton.addEventListener('click',()=>{const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';setTheme(theme);try{localStorage.setItem('pi495-theme',theme);}catch{}});
byId('menu-toggle').addEventListener('click',()=>{
  const button=byId('menu-toggle'),expanded=button.getAttribute('aria-expanded')!=='true';
  button.setAttribute('aria-expanded',String(expanded));byId('navigation').classList.toggle('open',expanded);
});
document.querySelectorAll('#navigation a').forEach(a=>a.addEventListener('click',()=>{byId('menu-toggle').setAttribute('aria-expanded','false');byId('navigation').classList.remove('open');}));
document.querySelectorAll('[data-language]').forEach(link=>link.addEventListener('click',()=>{
  try{localStorage.setItem('pi495-language',link.dataset.language);}catch{}
}));
document.querySelectorAll('[data-copy]').forEach(b=>b.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(b.dataset.copy);put('copy-status','Commande copiée.');}
  catch{put('copy-status','Copiez la commande affichée en la sélectionnant.');}
}));
renderGate(0);renderCase(0);renderScenario('valid');

})();

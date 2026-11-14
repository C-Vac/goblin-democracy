import { ATTACKS, CANDIDATE_TYPES, DISTRICTS, PRESETS, SAFEGUARDS, TOTAL_POPULATION } from '../../engine';
import { useMapArt } from '../mapArt';

export function About() {
  const art = useMapArt();
  return (
    <article className="card prose">
      <h2 style={{ marginTop: 0 }}>About the model</h2>
      <p>
        Mudwick Isle is a fictional goblin island. Its species, factions and candidates are invented; no real party or election is
        modelled. The mechanics are not invented: every attack below has happened somewhere, every safeguard exists somewhere, and
        the forensic tests are published methods you can run on real data in the <em>Your data</em> tab.
      </p>

      <h3>The isle</h3>
      <p>
        The map is GoblinLife.org&rsquo;s map of Mudwick Isle{art.version ? ` (version ${art.version})` : ''}, painted with AI image models and laid out by
        GoblinLife&rsquo;s own code, and loaded from GoblinLife.org as it is updated{art.source === 'mask' ? '; until it arrives, the isle is drawn as plain land and sea' : ''}. Its districts are whole blocks of the city&rsquo;s street grid. Polling places sit on a grid over the {DISTRICTS.length} districts and follow people, not land: each
        district gets places in proportion to its residents, sited where they live. Thin country still gets a handful of small
        halls (Gunner&rsquo;s Head, the mushroom woods, the Low Marsh), never as many as it has room for. The resident counts are working figures (about {Math.round(TOTAL_POPULATION / 1000)},000 in all), not a census.
        Each district counts its own ballots, so a district line is also a counting-house line. Who lives where follows the isle: pixies
        under the mushrooms, gnomes in the Revenue District, trolls in the wet south, dwarves in the Works, Leafies on the
        allotments and the hills. The <em>Enclaves</em> slider sets how strongly they keep to those places. Each district&rsquo;s
        character fades across its lines, because officials draw district lines, not the people who live there.
      </p>
      <ul className="small">
        {DISTRICTS.map((d) => <li key={d.id}><strong>{d.name}</strong> (about {d.population.toLocaleString('en-US')}). {d.brief}</li>)}
      </ul>

      <p>
        Two districts are not on the isle. <strong>Abroad</strong> holds goblin dual citizens living elsewhere: every ballot comes by
        post, later and less often than at home, and its block sits in the sea with an arrow off the map. <strong>Dwarven alien
        voters</strong> come in through Gimlet&rsquo;s Bore from Over There; in this simulator they are lawful resident voters, counted
        like anyone else. Nobody can redraw either district.
      </p>

      <h3>Candidates and parties</h3>
      <p>
        Every candidate belongs to a bloc, and the bloc sets their colour on the map: the Council bloc purple, the Gallery bloc green,
        independents orange, and two minor parties magenta and sky blue. Each candidate also has a type:
      </p>
      <ul>{CANDIDATE_TYPES.map((t) => <li key={t.id}><strong>{t.name}.</strong> {t.help}</li>)}</ul>
      <p>
        The winner is whoever has the most votes across the isle, or, if you choose, whoever wins the most districts. On the map
        each zone is tinted by its district&rsquo;s winner, and patterned by its canvass board: stripes for a board held by one faction,
        dots for a mixed board, a red zigzag for a board that wrote in its own numbers.
      </p>

      <h3>One election cycle</h3>
      <ol>
        <li><strong>Redistricting.</strong> If the gerrymandering slider is up, a boundary commission (three commissioners and a mapping consultant) moves polling places between neighbouring districts, one at a time, to win the attackers&rsquo; candidate as many districts as it can on last election&rsquo;s numbers. Districts stay in one piece. A mixed commission means recruiting the other side, who usually refuse and publish the draft. Under a popular vote the new lines change only who counts what.</li>
        <li><strong>Rolls and staffing.</strong> Each polling place gets three poll workers and maybe an observer. Its <em>oversight score</em> counts the independent parties present: distinct factions among the staff, plus one for an observer. A score of 1 is an insular node, where one faction holds every role. Historically that is where fraud worked.</li>
        <li><strong>Mail voting.</strong> Harvesting happens here, away from any polling place.</li>
        <li><strong>Election day.</strong> Stuffing needs every worker in the room. Insiders join; workers from another faction are asked, and most refuse and report it. Impersonation needs repeaters, and clerks from other factions may recognise them.</li>
        <li><strong>Count.</strong> Tampered tabulators move a few percent of votes. Paper ballots are untouched, so a hand count shows the difference; without paper the machine is the only record.</li>
        <li><strong>Canvass.</strong> Boards add up the returns. A colluding board writes in its own numbers. An honest board compares ballots with poll-book sign-ins (reconciliation) and sets aside stuffed ballots. Observers' photos of posted tapes expose altered returns.</li>
        <li><strong>Audit and recount.</strong> A random sample of paper is checked against the reported winner using BRAVO. If it cannot confirm the winner, or the margin is under the recount trigger, every paper ballot is counted by hand.</li>
        <li><strong>Certification.</strong> A board that dislikes the result may refuse to certify. Courts can order it to.</li>
        <li><strong>Aftermath.</strong> Every conspirator has a chance of talking. Voters find out someone voted in their name. Statisticians run the forensic tests on the published returns. A court that hears strong evidence of fraud big enough to matter orders a new election.</li>
      </ol>

      <h3>Attacks</h3>
      <ul>{ATTACKS.map((a) => <li key={a.id}><strong>{a.name}.</strong> {a.help}</li>)}</ul>
      <h3>Safeguards</h3>
      <ul>{SAFEGUARDS.map((g) => <li key={g.id}><strong>{g.name}.</strong> {g.help}</li>)}</ul>

      <h3>Conspirators and leaks</h3>
      <p>
        Each corrupted layer adds people. Insiders of the attackers' own faction are assumed to talk 3% of the time, paid hands
        (repeaters and harvesting operatives) 5 to 6%, and people recruited from another faction 25%. These rates are
        illustrative, not measured: the point is the arithmetic. The chance that nobody talks is the product of everyone
        staying quiet, so it falls fast as the crew grows. The Monte Carlo tab shows it.
      </p>

      <h3>The forensic tests</h3>
      <ul>
        <li><strong>Ballots against voters.</strong> Ballots should equal sign-ins plus returned mail envelopes, sign-ins should not exceed the roll, and the roll should not exceed the population. Standard reconciliation practice.</li>
        <li><strong>Turnout against vote share.</strong> Ballot stuffing pushes turnout and the winner's share up together, smearing the cloud of precincts toward the top-right corner (Klimek et al. 2012). A warning, not a verdict: bloc-voting enclaves can do the same.</li>
        <li><strong>Last digits.</strong> In counts above 100 the last digit should be roughly uniform; invented numbers are not (Beber and Scacco 2012).</li>
        <li><strong>Whole-number percentages.</strong> Hand-written returns land on round turnouts and shares more often than chance allows (Kobak, Shpilkin and Pshenichnikov 2016).</li>
        <li><strong>Outliers against neighbours.</strong> Each precinct against the median of its neighbours, scaled by sampling error plus the honest spread between neighbours.</li>
        <li><strong>Mail-ballot anomalies.</strong> A mail vote far from the in-person vote in the same place, or too many requested ballots never returned: the public signatures of the 2018 North Carolina case.</li>
        <li><strong>Jumps between counting houses.</strong> A tampered reporting chain shifts its whole territory, so the winner's share jumps at its border more than between neighbours inside it.</li>
        <li><strong>Map drawn for one side.</strong> Walks at random from the published map, moving one unit at a time to a neighbouring district and keeping each district within 15% of its size, and asks whether the published lines win any candidate more districts than nearly every map nearby. If they beat all but a fraction ε of the walk, p ≤ √(2ε) (Chikina, Frieze and Pegden 2017), multiplied by the number of candidates because each one is checked. The efficiency gap, the votes each side wastes, is shown beside it (Stephanopoulos and McGhee 2015); on Mudwick it is large even on the fair map, because districts differ so much in size and in who lives there, so it is not used as evidence on its own. A redrawn map goes to court when this test fails or a commissioner talks; a court that strikes it orders the count tallied on the old lines.</li>
        <li><strong>Second digits (Benford).</strong> Included because it is widely used, and labelled contested because it is: honest counts can fail it and fabricated ones pass (Mebane 2006; Deckert, Myagkov and Ordeshook 2011).</li>
      </ul>
      <p>
        The outlier thresholds were calibrated so that the honest default election fails each test in roughly 1 run in 100. Run
        enough tests on enough data and something always fails. That is why the false-positive preset exists, and why a flag is a
        reason to look, never proof.
      </p>

      <h3>Risk-limiting audits</h3>
      <p>
        A ballot-polling audit draws paper ballots at random and keeps a running likelihood ratio for the reported winner against
        each loser. When it passes 1/α the winner is confirmed with risk at most α; if the sample runs out first, everything is
        hand counted (Lindeman, Stark and Yates 2012). The ballots needed grow with the inverse square of the margin, so a
        5-point race needs a few hundred ballots and a half-point race tens of thousands (Wald's approximation).
      </p>

      <h3>Presets from history</h3>
      <ul>{PRESETS.filter((p) => p.kind === 'history').map((p) => <li key={p.id}><strong>{p.name}.</strong> {p.source}</li>)}</ul>
      <p>These presets reproduce a pattern, not a particular election's numbers.</p>

      <h3>What the model leaves out</h3>
      <p>
        Real fraud adapts to the safeguards; real safeguards have their own failure modes, budgets and politics; and the most
        common real threat to trust in elections is not fraud at all but false claims of it. The simulator is a way to see how
        layers of accountability interact, not a measure of any real election.
      </p>

      <h3>Sources</h3>
      <ul className="small">
        <li>Alvarez, R. M., Hall, T. E. and Hyde, S. D. (eds) (2008). <em>Election Fraud: Detecting and Deterring Electoral Manipulation.</em> Brookings Institution Press.</li>
        <li>Beber, B. and Scacco, A. (2012). What the numbers say: a digit-based test for election fraud. <em>Political Analysis</em> 20(2), 211–234.</li>
        <li>Campbell, T. (2005). <em>Deliver the Vote: A History of Election Fraud, an American Political Tradition, 1742–2004.</em> Carroll &amp; Graf.</li>
        <li>Chikina, M., Frieze, A. and Pegden, W. (2017). Assessing significance in a Markov chain without mixing. <em>PNAS</em> 114(11), 2860–2864.</li>
        <li>Deckert, J., Myagkov, M. and Ordeshook, P. C. (2011). Benford's law and the detection of election fraud. <em>Political Analysis</em> 19(3), 245–268.</li>
        <li>Klimek, P., Yegorov, Y., Hanel, R. and Thurner, S. (2012). Statistical detection of systematic election irregularities. <em>PNAS</em> 109(41), 16469–16473.</li>
        <li>Kobak, D., Shpilkin, S. and Pshenichnikov, M. S. (2016). Integer percentages as electoral falsification fingerprints. <em>Annals of Applied Statistics</em> 10(1), 54–73.</li>
        <li>Lindeman, M. and Stark, P. B. (2012). A gentle introduction to risk-limiting audits. <em>IEEE Security &amp; Privacy</em> 10(5), 42–49.</li>
        <li>Lindeman, M., Stark, P. B. and Yates, V. S. (2012). BRAVO: ballot-polling risk-limiting audits to verify outcomes. <em>EVT/WOTE '12</em>.</li>
        <li>Mebane, W. R. Jr. (2006). Election forensics: vote counts and Benford's law. Paper for the Political Methodology Society summer meeting.</li>
        <li>Myagkov, M., Ordeshook, P. C. and Shakin, D. (2009). <em>The Forensics of Election Fraud: Russia and Ukraine.</em> Cambridge University Press.</li>
        <li>North Carolina State Board of Elections (2019). Hearing and order on the 2018 general election for the 9th congressional district.</li>
        <li>Stephanopoulos, N. O. and McGhee, E. M. (2015). Partisan gerrymandering and the efficiency gap. <em>University of Chicago Law Review</em> 82(2), 831–900.</li>
        <li>Wald, A. (1945). Sequential tests of statistical hypotheses. <em>Annals of Mathematical Statistics</em> 16(2), 117–186.</li>
      </ul>
    </article>
  );
}

/**
 * ONE-SHOT BULK IMPORT — Sep 8 2026 batch (Rachel's Form Submitter.docx)
 *
 * Paste this file into the Apps Script project alongside Code.gs, run
 * bulkImportEvents_20260908() once, then delete the file (or leave it as
 * a record).
 *
 * The function uses the same set() pattern as submitNewEvent(), which
 * looks up columns by NAME from the sheet header — so it survives any
 * future column reordering on the EventSubmissions sheet. It auto-
 * generates a fresh Event ID + Edit Token per row (same shape as normal
 * form submissions) and appends every row.
 *
 * ROW COUNT: 25 rows total from 20 form submissions.
 *   • 8 single-event submissions
 *   • 11 recurring-series submissions (rolled into one row using
 *     Additional Dates JSON — dates array with per-date start/end times)
 *   • 6 rows from Sarah DeCato's School Health series, which is
 *     intentionally SPLIT per-date because each date has its own
 *     topic + description (per her form note).
 *
 * Program / Initiative column: only BTAM (row 20) is tagged, per Rebekah's
 * request. Uses the string "Behavioral Threat Assessment & Management".
 * If your sheet doesn't have that column yet, add it (any position) before
 * running — set() will find it by name.
 *
 * Times missing from the source doc are left BLANK on purpose so Rachel
 * can fill them in during her review. Admin Notes on each such row spells
 * out what's missing.
 */
function bulkImportEvents_20260908() {
  var ctx = _openEventsSheet();
  if (ctx.error) throw new Error(ctx.error);

  // Additional Dates JSON helper — matches the format the calendar
  // expansion code reads (keys are `date`, `start`, `end`).
  function extras() {
    var out = [];
    for (var i = 0; i < arguments.length; i++) {
      var t = arguments[i]; // [date, start, end]
      out.push({ date: t[0], start: t[1] || '', end: t[2] || '' });
    }
    return JSON.stringify(out);
  }

  // Common ECSE fields — Sandy Flacke, virtual, no times given
  var ECSE = {
    'Focus Area': 'Special Services & Inclusive Education',
    'Contact Name': 'Sandy Flacke',
    'Contact Email': 'j.sandy.flacke@maine.gov',
    'Submitter Email': 'j.sandy.flacke@maine.gov',
    'Location Type': 'Virtual',
    'All Day': false,
    'Register Text': 'Join meeting',
    'Admin Notes': 'Session times not provided by submitter — confirm before publishing.'
  };
  // Common School Health fields — Sarah DeCato, virtual, one Zoom reg link
  var SH = {
    'Focus Area': 'School Health',
    'Type': 'Webinar',
    'Intended Audience': 'School Nurses',
    'Contact Name': 'Sarah DeCato',
    'Contact Email': 'sarah.decato@maine.gov',
    'Submitter Email': 'sarah.decato@maine.gov',
    'Location Type': 'Virtual',
    'All Day': false,
    'Register URL': 'https://mainestate.zoom.us/meeting/register/4c_8Q0aETC-2H7xkNrh8xw',
    'Register Text': 'Register',
    'Admin Notes': 'Session times not specified in submission — confirm with Sarah.'
  };

  var events = [
    // ── 1. Green Schools Nov 19 — Falmouth ────────────────────────
    {
      'Status': 'Received',
      'Title': 'Green Schools Regional Gathering — Falmouth',
      'Focus Area': 'School Facilities',
      'Type': 'Conference',
      'Intended Audience': 'Middle and high school students, educators, school administrators, facilities managers, principals, superintendents, community-based organizations',
      'Description': 'The Green Schools Regional Gatherings are free, half-day events featuring collaborative workshops and practical resources designed to promote student leadership and help participants build long-term sustainability action plans their schools and districts.',
      'Description Teaser': 'Free half-day workshop for student leadership and sustainability action plans.',
      'Start Date': '2026-11-19', 'Start Time': '09:00', 'End Date': '2026-11-19', 'End Time': '13:30',
      'All Day': false,
      'Location Type': 'In-Person',
      'Venue Name': 'Gilsland Farm',
      'Venue Address': '20 Gilsland Farm Rd, Falmouth, ME 04105',
      'Register URL': 'https://events.bizzabo.com/979541',
      'Register Text': 'Register',
      'Contact Name': 'Naomi Lopez', 'Contact Email': 'naomi.lopez@maine.gov',
      'Submitter Email': 'naomi.lopez@maine.gov',
      'Admin Notes': 'Naomi flagged a conflict with another DOE event that day but wanted to proceed — audience is primarily student groups.'
    },
    // ── 2. Green Schools Nov 6 — East Boothbay ────────────────────
    {
      'Status': 'Received',
      'Title': 'Green Schools Regional Gathering — East Boothbay',
      'Focus Area': 'School Facilities',
      'Type': 'Conference',
      'Intended Audience': 'Middle and high school students, educators, school administrators, facilities managers, principals, superintendents, community-based organizations',
      'Description': 'The Green Schools Regional Gatherings are free, half-day events featuring collaborative workshops and practical resources designed to promote student leadership and help participants build long-term sustainability action plans their schools and districts.',
      'Description Teaser': 'Free half-day workshop for student leadership and sustainability action plans.',
      'Start Date': '2026-11-06', 'Start Time': '09:00', 'End Date': '2026-11-06', 'End Time': '13:30',
      'All Day': false,
      'Location Type': 'In-Person',
      'Venue Name': '',
      'Venue Address': '60 Bigelow Dr, East Boothbay, ME 04544',
      'Register URL': 'https://events.bizzabo.com/979541',
      'Register Text': 'Register',
      'Contact Name': 'Naomi Lopez', 'Contact Email': 'naomi.lopez@maine.gov',
      'Submitter Email': 'naomi.lopez@maine.gov'
    },
    // ── 3. Green Schools Oct 28 — Orono ───────────────────────────
    {
      'Status': 'Received',
      'Title': 'Green Schools Regional Gathering — Orono',
      'Focus Area': 'School Facilities',
      'Type': 'Conference',
      'Intended Audience': 'Middle and high school students, educators, school administrators, facilities managers, principals, superintendents, community-based organizations',
      'Description': 'The Green Schools Regional Gatherings are free, half-day events featuring collaborative workshops and practical resources designed to promote student leadership and help participants build long-term sustainability action plans their schools and districts.',
      'Description Teaser': 'Free half-day workshop for student leadership and sustainability action plans.',
      'Start Date': '2026-10-28', 'Start Time': '09:00', 'End Date': '2026-10-28', 'End Time': '13:30',
      'All Day': false,
      'Location Type': 'In-Person',
      'Venue Name': '',
      'Venue Address': '131 Munson Rd, Orono, ME 04469',
      'Register URL': 'https://events.bizzabo.com/979541',
      'Register Text': 'Register',
      'Contact Name': 'Naomi Lopez', 'Contact Email': 'naomi.lopez@maine.gov',
      'Submitter Email': 'naomi.lopez@maine.gov',
      'Admin Notes': 'Time not specified — assumed 9:00-13:30 to match the other two Green Schools gatherings. Confirm with Naomi.'
    },
    // ── 4. ECSE Special Educators & Related Service Providers ─────
    Object.assign({}, ECSE, {
      'Status': 'Received',
      'Title': 'ECSE Community of Practice — Special Educators & Related Service Providers',
      'Type': 'Office Hours',
      'Intended Audience': 'ECSE Special Educators and Related Service Providers',
      'Description': 'The ECSE Community of Practice for Special Educators and Related Service Providers is a statewide opportunity to connect, collaborate, and learn from colleagues supporting young children with disabilities. Sessions will focus on effective ECSE practices, collaborative and inclusive service delivery, IEP implementation, and supporting children within their natural learning environments. Targeted topics will reflect the needs and questions of practitioners in the field, with upcoming topics and session information announced through EnGiNE.',
      'Description Teaser': 'Statewide community of practice for ECSE special educators and related service providers.',
      'Start Date': '2026-10-07', 'End Date': '2026-10-07',
      'Register URL': '',
      'Additional Dates': extras(
        ['2026-12-02','',''], ['2027-02-10','',''], ['2027-04-07','',''], ['2027-06-02','','']
      )
    }),
    // ── 5. ECSE Preschool Educators ───────────────────────────────
    Object.assign({}, ECSE, {
      'Status': 'Received',
      'Title': 'ECSE Community of Practice — Preschool Educators',
      'Type': 'Discussion Group',
      'Intended Audience': 'Preschool Educators',
      'Description': 'The ECSE Preschool Educator Community of Practice is a statewide opportunity for preschool teachers to connect, collaborate, and learn from colleagues supporting young children with disabilities in inclusive settings. Sessions will focus on practical strategies, inclusive practices, supporting diverse learners, and navigating Early Childhood Special Education (ECSE) within the preschool classroom. Targeted topics will reflect the needs and questions of educators in the field, with upcoming topics and session information announced through EnGiNE.',
      'Description Teaser': 'Statewide community of practice for preschool educators supporting inclusive settings.',
      'Start Date': '2026-09-30', 'End Date': '2026-09-30',
      'Register URL': 'https://mainestate.zoom.us/j/85063185813',
      'Additional Dates': extras(
        ['2026-12-01','',''], ['2027-02-03','',''], ['2027-03-31','',''], ['2027-06-01','','']
      )
    }),
    // ── 6. ECSE Special Education Directors & Coordinators ────────
    Object.assign({}, ECSE, {
      'Status': 'Received',
      'Title': 'ECSE Community of Practice — Special Education Directors & Coordinators',
      'Type': 'Office Hours',
      'Intended Audience': 'Special Education Directors and ECSE Coordinators',
      'Description': 'The ECSE Special Education Directors and ECSE Coordinators Community of Practice is a statewide opportunity for leaders responsible for implementing Early Childhood Special Education (ECSE) within their SAUs. Sessions provide a collaborative space to work through implementation questions, share practices and resources, learn from colleagues, and strengthen understanding of ECSE requirements and responsibilities. Targeted topics will reflect emerging needs and questions from the field, with upcoming topics and session information announced through EnGiNE.',
      'Description Teaser': 'Statewide community of practice for SpEd Directors + ECSE Coordinators.',
      'Start Date': '2026-09-23', 'End Date': '2026-09-23',
      'Register URL': 'https://mainestate.zoom.us/j/87827534069',
      'Additional Dates': extras(
        ['2026-11-18','',''], ['2027-01-27','',''], ['2027-03-24','',''], ['2027-05-26','','']
      )
    }),
    // ── 7. ECSE Superintendents ───────────────────────────────────
    Object.assign({}, ECSE, {
      'Status': 'Received',
      'Title': 'ECSE Community of Practice — Superintendents',
      'Type': 'Office Hours',
      'Intended Audience': 'Superintendents',
      'Description': 'The ECSE Superintendent Community of Practice is a statewide opportunity for superintendents to connect with and learn from colleagues navigating the Early Childhood Special Education (ECSE) transition. Sessions provide a space to work through questions, share experiences and strategies, and build a stronger understanding of ECSE responsibilities and implementation at the SAU level. Targeted topics will be shaped by superintendent needs and emerging questions, with upcoming topics and session information announced through EnGiNE.',
      'Description Teaser': 'Statewide community of practice for superintendents navigating ECSE transition.',
      'Start Date': '2026-09-22', 'End Date': '2026-09-22',
      'Register URL': 'https://mainestate.zoom.us/j/81646432494',
      'Additional Dates': extras(
        ['2026-11-19','',''], ['2027-01-20','',''], ['2027-03-17','',''], ['2027-05-19','','']
      )
    }),
    // ── 8. IEP + MaineCare 28 & 65 ────────────────────────────────
    {
      'Status': 'Received',
      'Title': 'Guidance on IEPs and MaineCare Sections 28 and 65 Services',
      'Focus Area': 'Federal Programs',
      'Type': 'Training',
      'Intended Audience': 'School Administrative Units (SAUs), providers, and other stakeholders',
      'Description': 'The Maine Department of Education (DOE), in collaboration with the Maine Department of Health and Human Services (DHHS), will offer a repeat and expanded virtual training on the recently issued joint guidance related to Individualized Education Programs (IEPs) and updates and clarifications to MaineCare Sections 28 and 65 services, which include behavioral and developmental services. The significant level of participation and number of questions received during and following the initial training demonstrated the need for additional opportunities to review the guidance, clarify its application, and respond to questions from the field. In response, Maine DOE and DHHS are offering this additional session to provide further explanation and support consistent implementation across the state. The training will support school administrative units (SAUs), providers, and other stakeholders in understanding and implementing the updated guidance. Particular attention will be given to the intersection of IEP requirements and MaineCare-covered services, compliance with applicable federal and state requirements, and clarification of how MaineCare funding may be accessed for eligible services. Representatives from Maine DOE and the Office of MaineCare Services (OMS) will review changes to eligibility for Sections 28 and 65 services, discuss implications for IEP development and service provision, revisit key questions raised during the initial session, and provide additional clarification based on feedback received from participants.',
      'Description Teaser': 'Joint DOE/DHHS training on IEPs + MaineCare Sections 28 and 65 services.',
      'Start Date': '2026-09-11', 'Start Time': '12:00', 'End Date': '2026-09-11', 'End Time': '14:00',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://mainestate.zoom.us/meeting/register/N3Ov5LhqSkW56MR83w7s5g',
      'Register Text': 'Register',
      'Contact Name': 'Erin Frazier', 'Contact Email': 'Erin.Frazier@maine.gov',
      'Submitter Email': 'Amanda.Castner@maine.gov',
      'Admin Notes': 'Submitted by Amanda Castner on behalf of Erin Frazier. Registration required in advance.'
    },
    // ── 9. ECSE Business Managers ─────────────────────────────────
    Object.assign({}, ECSE, {
      'Status': 'Received',
      'Title': 'ECSE Community of Practice — Business Managers',
      'Type': 'Office Hours',
      'Intended Audience': 'Superintendents, Business Managers, Special Education Directors',
      'Description': 'ECSE Business Manager Open Office Hours is a statewide Community of Practice designed for business managers and other staff responsible for the fiscal and budget components of Early Childhood Special Education (ECSE). Sessions will focus on topics specific to ECSE funding, budgeting, allowable expenditures, fiscal processes, and other financial considerations related to the ECSE transition. Each session will feature a targeted topic, with upcoming topics and session information announced through EnGiNE.',
      'Description Teaser': 'Community of practice for business managers on ECSE funding + fiscal processes.',
      'Start Date': '2026-09-09', 'End Date': '2026-09-09',
      'Register URL': 'https://mainestate.zoom.us/j/81502205445',
      'Additional Dates': extras(
        ['2026-11-10','',''], ['2027-01-13','',''], ['2027-03-10','',''], ['2027-05-12','','']
      )
    }),
    // ── 10. ECSE Open Office Hours ────────────────────────────────
    Object.assign({}, ECSE, {
      'Status': 'Received',
      'Title': 'ECSE Open Office Hours — Community of Practice',
      'Type': 'Office Hours',
      'Intended Audience': 'Superintendents, Special Education Directors, Business Managers, Preschool Teachers, ECSE Providers',
      'Description': 'ECSE Open Office Hours is a statewide Community of Practice open to all educators and administrators who are currently part of the Early Childhood Special Education (ECSE) transition or will be transitioning in the future. These sessions provide opportunities to connect, learn, ask questions, and share practices with colleagues across the state. Each Open Office Hours session will feature a targeted ECSE topic, with upcoming topics and session information announced through EnGiNE.',
      'Description Teaser': 'Statewide open office hours for anyone in the ECSE transition.',
      'Start Date': '2026-11-04', 'End Date': '2026-11-04',
      'Register URL': 'https://mainestate.zoom.us/j/83813657846',
      'Additional Dates': extras(
        ['2027-01-06','',''], ['2027-03-03','',''], ['2027-05-05','','']
      )
    }),

    // ── 11. School Health Monthly Webinar — 6 SEPARATE ROWS ───────
    // Sarah asked for one calendar event per date with the date-specific
    // topic + description. Split intentionally.
    Object.assign({}, SH, {
      'Status': 'Received',
      'Title': 'School Health Webinar — Stigmatizing Language in School Health',
      'Description': 'The words we use matter. Common terms such as frequent flyer, noncompliant, and attention-seeking can influence perceptions and shape interactions with students and families. This presentation explores the impact of stigmatizing language in school health settings and examines how language choices affect communication, documentation, and student outcomes. Participants will gain practical strategies for recognizing and replacing stigmatizing language with objective, person-centered communication that promotes trust, equity, and compassionate care.',
      'Description Teaser': 'The words we use matter. Recognizing and replacing stigmatizing language in school health.',
      'Start Date': '2026-11-03', 'End Date': '2026-11-03'
    }),
    Object.assign({}, SH, {
      'Status': 'Received',
      'Title': 'School Health Webinar — Northern New England Poison Center Overview',
      'Description': 'This webinar will provide a brief history of the Northern New England Poison Control (NNEPC), a summary of services delivered, a review of recent poisoning data in Maine, and information about emerging issues related to substances that might be accessible and pose risks to children, especially adolescents.',
      'Description Teaser': 'NNEPC overview + emerging student-safety issues around accessible substances.',
      'Start Date': '2026-12-01', 'End Date': '2026-12-01'
    }),
    Object.assign({}, SH, {
      'Status': 'Received',
      'Title': 'School Health Webinar — Human Trafficking Prevention',
      'Description': 'This webinar will focus on ways that school nurses can identify risk factors and signs that a student may be in an exploitative situation. Language and resources to help prevent escalation and facilitate exit from the situation will be addressed along with how to remove barriers to create a safe space for students to have these conversations.',
      'Description Teaser': 'Identifying risk factors + early intervention for students in exploitative situations.',
      'Start Date': '2027-01-05', 'End Date': '2027-01-05'
    }),
    Object.assign({}, SH, {
      'Status': 'Received',
      'Title': 'School Health Webinar — Tools to Support Health Information Sharing',
      'Description': 'Information sharing and coordination of care across the health and educational sectors is often limited by lack of consent which can result in gaps in care and missed opportunities for integrated, aligned support for families. To meet the needs of states and/or local communities and the privacy requirements for both health and education sectors, including under FERPA and HIPAA, an information sharing consent form template and Implementation Toolkit will be discussed (2025, American Academy of Pediatrics).',
      'Description Teaser': 'Consent form template + Implementation Toolkit for FERPA/HIPAA-safe info sharing.',
      'Start Date': '2027-02-02', 'End Date': '2027-02-02'
    }),
    Object.assign({}, SH, {
      'Status': 'Received',
      'Title': 'School Health Webinar — Vectorborne Diseases in Maine',
      'Description': 'Vectorborne diseases and environmental insect exposures are becoming increasingly important public health concerns in Maine. This webinar will provide school health professionals with current information on the insects and arthropods they are most likely to encounter, including ticks, mosquitoes, and browntail moth caterpillars. Participants will learn how to recognize common exposures, understand the health risks associated with each, provide appropriate first-line management, identify when medical evaluation is warranted, and implement practical prevention strategies for school settings.',
      'Description Teaser': 'Prevention, recognition, and response to ticks, mosquitoes, and browntail moth exposures.',
      'Start Date': '2027-03-02', 'End Date': '2027-03-02'
    }),
    Object.assign({}, SH, {
      'Status': 'Received',
      'Title': 'School Health Webinar — Supporting Students with Endometriosis',
      'Description': 'Endometriosis affects up to 18% of people assigned female at birth, with symptoms often beginning during adolescence. Yet severe menstrual pain and related symptoms are frequently normalized, contributing to lengthy delays in diagnosis and care. This webinar will provide school nurses with a foundational understanding of adolescent endometriosis, including common symptoms, potential impacts on school attendance and daily functioning, and signs that may warrant further care. The session will also introduce ENPOWR, the Endometriosis Foundation of America\'s free education program, and program resources available to help schools strengthen endometriosis awareness, early recognition, and student support.',
      'Description Teaser': 'Adolescent endometriosis + the ENPOWR education program for school nurses.',
      'Start Date': '2027-04-06', 'End Date': '2027-04-06'
    }),

    // ── 12. MTSS Walk-In Office Hours ────────────────────────────
    {
      'Status': 'Received',
      'Title': 'MTSS Walk-In Office Hours',
      'Focus Area': 'Instructional Supports',
      'Type': 'Office Hours',
      'Intended Audience': 'School-level Administrators and Educators',
      'Description': 'Participants may bring MTSS questions or topics they would like to discuss. Please see the registration link for more details.',
      'Description Teaser': 'Bring MTSS questions or topics for discussion.',
      'Start Date': '2026-09-23', 'Start Time': '15:00', 'End Date': '2026-09-23', 'End Time': '16:00',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://mainestate.zoom.us/meeting/register/pmR0SzntS4K6H_0_SKo1cA',
      'Register Text': 'Register',
      'Contact Name': 'Bryan Lescord', 'Contact Email': 'Bryan.Lescord@maine.gov',
      'Submitter Email': 'Bryan.Lescord@maine.gov'
    },
    // ── 13. MTSS Fidelity of Implementation ──────────────────────
    {
      'Status': 'Received',
      'Title': 'MTSS Topic-Based Office Hours — Fidelity of Implementation',
      'Focus Area': 'Instructional Supports',
      'Type': 'Office Hours',
      'Intended Audience': 'School-level Administrators and Educators',
      'Description': 'How can your school assess its implementation of a Multi-Tiered System of Supports (MTSS)? This session will introduce the concept of fidelity of implementation with discussion of the topic to follow. We will draw on resources from the American Institutes for Research Center on Multi-Tiered System of Supports (AIR Center on MTSS), the Center on Positive Behavioral Interventions and Supports (PBIS), and a forthcoming Maine MTSS Professional Learning Series. A brief overview will be provided of how schools can examine their current implementation, identify strengths and areas for growth, and use that information to support continuous improvement.',
      'Description Teaser': 'Introducing fidelity of implementation with a Tier-1 focus for MTSS Leadership Teams.',
      'Start Date': '2026-09-16', 'Start Time': '14:00', 'End Date': '2026-09-16', 'End Time': '15:00',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://mainestate.zoom.us/meeting/register/IEHIKeOFQPCpVLtOIYyNCg',
      'Register Text': 'Register',
      'Contact Name': 'Bryan Lescord', 'Contact Email': 'Bryan.Lescord@maine.gov',
      'Submitter Email': 'Bryan.Lescord@maine.gov'
    },
    // ── 14. MTSS Professional Learning Webinar Series (9 dates) ──
    {
      'Status': 'Received',
      'Title': 'MTSS Professional Learning Webinar Series',
      'Focus Area': 'Instructional Supports',
      'Type': 'Webinar',
      'Intended Audience': 'School-level Administrators and Educators',
      'Description': 'This virtual professional learning webinar series provides school teams with an opportunity to deepen their understanding of school-level implementation of a Multi-Tiered System of Supports (MTSS). Throughout the series, participants will reflect on their school\'s current level of MTSS implementation — or consider how to begin the journey — and identify action steps to strengthen their system. Sessions will emphasize practical application and provide opportunities for participants to reflect on their learning and connect it to their school contexts. The learning series will center on the Maine Multi-Tiered System of Supports Fidelity of Implementation Rubric (MTSS-FIR), which is being piloted during the 2026–27 school year as part of this and other Maine DOE professional learning opportunities. The MTSS-FIR is designed to support school-level MTSS Leadership Teams in examining current implementation, establishing goals, and engaging in continuous improvement. The series will focus predominantly on Tier 1 — the foundation of a school\'s MTSS — with consideration of Tiers 2 and 3 later in the year.',
      'Description Teaser': 'Year-long MTSS webinar series centered on the Maine MTSS-FIR rubric. 1.5 contact hours per session with completed exit survey.',
      'Start Date': '2026-09-29', 'Start Time': '15:30', 'End Date': '2026-09-29', 'End Time': '17:00',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://mainestate.zoom.us/webinar/register/WN_eK7U_bVsQHepSdIBkVOsqA',
      'Register Text': 'Register',
      'Contact Name': 'Bryan Lescord', 'Contact Email': 'Bryan.Lescord@maine.gov',
      'Submitter Email': 'Bryan.Lescord@maine.gov',
      'Contact Hours': true,
      'Additional Dates': extras(
        ['2026-10-26','15:30','17:00'],
        ['2026-11-23','15:30','17:00'],
        ['2026-12-21','15:30','17:00'],
        ['2027-01-25','15:30','17:00'],
        ['2027-02-22','15:30','17:00'],
        ['2027-03-22','15:30','17:00'],
        ['2027-04-26','15:30','17:00'],
        ['2027-05-17','15:30','17:00']
      ),
      'Admin Notes': 'Sept date is Tuesday 9/29 (exception per submitter). Dec and May dates are also exception dates per submitter (12/21 Mon, 5/17 Mon). Others fall on the fourth Monday.'
    },
    // ── 15. Educator & Ed Tech Vacancy Collection ────────────────
    {
      'Status': 'Received',
      'Title': 'Educator and Ed. Tech. Vacancy Collection Webinar',
      'Focus Area': 'Data',
      'Type': 'Webinar',
      'Intended Audience': 'Staff Data Specialists, Superintendents',
      'Description': 'Open positions that SAUs are actively seeking to fill in October and beyond signal an unmet staffing need. This webinar will provide the nuts and bolts of the collection of FTE teacher vacancy data and FTE ed tech vacancy data based on teacher certification endorsements and ed. tech certification levels. The target audience for the webinar are school administrative unit superintendents and their designee who will complete the Teacher and Educational Technician Vacancy Collection.',
      'Description Teaser': 'Nuts and bolts of the FTE teacher + ed tech vacancy data collection for SAUs.',
      'Start Date': '2026-10-01', 'Start Time': '12:00', 'End Date': '2026-10-01', 'End Time': '13:00',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://events.gcc.teams.microsoft.com/event/760203bb-a0f9-4bb0-b751-3021eab33875@413fa8ab-207d-4b62-9bcd-ea1a8f2f864e',
      'Register Text': 'Register',
      'Contact Name': 'Alexandra Cookson', 'Contact Email': 'alexandra.cookson@maine.gov',
      'Submitter Email': 'alexandra.cookson@maine.gov'
    },
    // ── 16. WIDA Tell Us About Your Child ────────────────────────
    {
      'Status': 'Received',
      'Title': 'Introducing WIDA\'s "Tell Us About Your Child" Survey and User\'s Guide',
      'Focus Area': 'Multilingual Learning',
      'Type': 'Office Hours',
      'Intended Audience': 'Special Education Directors, ML Directors/Coordinators, ESOL educators, Special Education educators',
      'Description': 'Join Maine educators and colleagues for an introductory session on WIDA\'s Tell Us About Your Child Survey and User\'s Guide, a required step in the multilingual learner identification and screening process for students enrolling with significant cognitive disabilities. This session will provide an overview of the resource, guidance from Maine DOE specialists, and an opportunity to ask questions and explore initial implementation considerations.',
      'Description Teaser': 'Intro to WIDA\'s Tell Us About Your Child survey — required step in the ML screening process for students with significant cognitive disabilities.',
      'Start Date': '2026-09-14', 'Start Time': '15:30', 'End Date': '2026-09-14', 'End Time': '16:30',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://mainestate.zoom.us/meeting/register/UoVYWe9NSNSdPuleX8OhIA',
      'Register Text': 'Register',
      'Contact Name': 'Jane Armstrong', 'Contact Email': 'Jane.Armstrong@maine.gov',
      'Submitter Email': 'Jane.Armstrong@maine.gov',
      'Admin Notes': 'Submitter had typo "4:430 p.m." — assumed 4:30 p.m. end time.'
    },
    // ── 17. K-2 For ME PLCs (7 dates, second Tuesday of month) ───
    {
      'Status': 'Received',
      'Title': 'Kindergarten through Grade 2 For ME Virtual Professional Learning Communities',
      'Focus Area': 'Early Learning',
      'Type': 'Discussion Group',
      'Intended Audience': 'Teachers, administrators, and coaching support implementing For ME in grades K-2',
      'Description': 'The Maine Department of Education (DOE), in collaboration with teacher leaders from across the state, is once again offering professional learning communities (PLCs) for educators administrators implementing the For ME Learning programs, which include K for ME, 1st Grade for ME, and 2nd Grade for ME. These monthly virtual PLCs are designed to deepen understanding of program design and implementation. Participants will explore units and components in greater depth through real-world examples, shared practices, open discussion, and student work. Whether you are new to a program or have been using it for several years, these PLCs offer valuable support for teachers, ed techs, instructional coaches, and other staff.',
      'Description Teaser': 'Monthly PLCs for K-2 For ME educators. Contact-hour certificates provided in April based on overall attendance.',
      'Start Date': '2026-10-13', 'Start Time': '15:30', 'End Date': '2026-10-13', 'End Time': '16:30',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://forms.cloud.microsoft/g/BaNVXnF1sR',
      'Register Text': 'Register',
      'Contact Name': 'Nicole Madore', 'Contact Email': 'nicole.madore@maine.gov',
      'Submitter Email': 'nicole.madore@maine.gov',
      'Contact Hours': true,
      'Additional Dates': extras(
        ['2026-11-10','15:30','16:30'],
        ['2026-12-08','15:30','16:30'],
        ['2027-01-12','15:30','16:30'],
        ['2027-02-09','15:30','16:30'],
        ['2027-03-09','15:30','16:30'],
        ['2027-04-13','15:30','16:30']
      )
    },
    // ── 18. Pre-K for ME PLCs — evening (8 dates, first Mon 6-7pm)
    {
      'Status': 'Received',
      'Title': 'Pre-K for ME Virtual Professional Learning Communities (evening session)',
      'Focus Area': 'Early Learning',
      'Type': 'Workshop',
      'Intended Audience': 'Educators, administrators, and staff who implement Pre-K for ME in classrooms',
      'Description': 'Pre-K for ME monthly virtual PLCs are designed to deepen understanding of program design and implementation. Participants will explore units and components in greater depth through real-world examples, shared practices, open discussion, and student work. Whether you are new to a program or have been using it for several years, these PLCs offer valuable support for teachers, ed techs, instructional coaches, and other staff.',
      'Description Teaser': 'Evening PLCs (6-7pm) for Pre-K for ME educators. Monthly, first Monday.',
      'Start Date': '2026-10-05', 'Start Time': '18:00', 'End Date': '2026-10-05', 'End Time': '19:00',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://forms.cloud.microsoft/g/gyCqRQTQMi',
      'Register Text': 'Register',
      'Contact Name': 'Marcy Whitcomb', 'Contact Email': 'marcy.r.whitcomb@maine.gov',
      'Submitter Email': 'marcy.r.whitcomb@maine.gov',
      'Additional Dates': extras(
        ['2026-11-02','18:00','19:00'],
        ['2026-12-07','18:00','19:00'],
        ['2027-01-04','18:00','19:00'],
        ['2027-02-01','18:00','19:00'],
        ['2027-03-01','18:00','19:00'],
        ['2027-04-05','18:00','19:00'],
        ['2027-05-03','18:00','19:00']
      )
    },
    // ── 19. Pre-K for ME PLCs — afternoon (8 dates, first Mon 3:30-4:30)
    {
      'Status': 'Received',
      'Title': 'Pre-K for ME Virtual Professional Learning Communities (afternoon session)',
      'Focus Area': 'Early Learning',
      'Type': 'Workshop',
      'Intended Audience': 'Educators, administrators, and staff who implement Pre-K for ME in classrooms',
      'Description': 'Pre-K for ME monthly virtual PLCs are designed to deepen understanding of program design and implementation. Participants will explore units and components in greater depth through real-world examples, shared practices, open discussion, and student work. Whether you are new to a program or have been using it for several years, these PLCs offer valuable support for teachers, ed techs, instructional coaches, and other staff. Sessions will be held the first Monday of each month.',
      'Description Teaser': 'Afternoon PLCs (3:30-4:30pm) for Pre-K for ME educators. Monthly, first Monday.',
      'Start Date': '2026-10-05', 'Start Time': '15:30', 'End Date': '2026-10-05', 'End Time': '16:30',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://forms.cloud.microsoft/g/evK9zyz5ga',
      'Register Text': 'Register',
      'Contact Name': 'Marcy Whitcomb', 'Contact Email': 'marcy.r.whitcomb@maine.gov',
      'Submitter Email': 'marcy.r.whitcomb@maine.gov',
      'Additional Dates': extras(
        ['2026-11-02','15:30','16:30'],
        ['2026-12-07','15:30','16:30'],
        ['2027-01-04','15:30','16:30'],
        ['2027-02-01','15:30','16:30'],
        ['2027-03-01','15:30','16:30'],
        ['2027-04-05','15:30','16:30'],
        ['2027-05-03','15:30','16:30']
      )
    },
    // ── 20. BTAM Office Hours (16 dates, weekly Fridays 9:30am) ──
    {
      'Status': 'Received',
      'Title': 'Behavioral Threat Assessment & Management (BTAM) Office Hours',
      'Focus Area': 'School Safety',
      'Type': 'Office Hours',
      'Intended Audience': 'Administrators, mental health professionals, school psychologists, school resource officers, counselors, nurses, and other members of a school\'s multidisciplinary threat assessment team',
      'Description': 'Meet with Dr. Jim Babcock and the BTAM Team to discuss anything related to CSTAG training, policy or implementation; violence prevention; and/or threat assessment & management.',
      'Description Teaser': 'Weekly Friday drop-in with Dr. Jim Babcock and the BTAM Team.',
      'Start Date': '2026-09-04', 'Start Time': '09:30', 'End Date': '2026-09-04', 'End Time': '',
      'All Day': false,
      'Location Type': 'Virtual',
      'Register URL': 'https://mainestate.zoom.us/j/83021207124?pwd=kx6hlFDhLJ2QMucshQhXRuRJLLZ7x2.1',
      'Register Text': 'Join meeting',
      'Contact Name': 'Jim Babcock', 'Contact Email': 'james.babcock@maine.gov',
      'Submitter Email': 'Rebekah.Maranatha@maine.gov',
      'Program / Initiative': 'Behavioral Threat Assessment & Management',
      'Additional Dates': extras(
        ['2026-09-11','09:30',''],
        ['2026-09-18','09:30',''],
        ['2026-09-25','09:30',''],
        ['2026-10-02','09:30',''],
        ['2026-10-09','09:30',''],
        ['2026-10-16','09:30',''],
        ['2026-10-23','09:30',''],
        ['2026-10-30','09:30',''],
        ['2026-11-06','09:30',''],
        ['2026-11-13','09:30',''],
        ['2026-11-20','09:30',''],
        ['2026-11-27','09:30',''],
        ['2026-12-04','09:30',''],
        ['2026-12-11','09:30',''],
        ['2026-12-18','09:30','']
      ),
      'Admin Notes': 'Rebekah asked us to tag as BTAM. No registration required — link is the Zoom join. Only start time given (9:30 a.m.) — end time missing, confirm with Rebekah.'
    }
  ];

  // Append each event using the same set() pattern as submitNewEvent —
  // that way the code doesn't care about column ORDER on the sheet, only
  // that the columns exist by name.
  var appended = 0;
  for (var e = 0; e < events.length; e++) {
    var ev = events[e];
    var editToken = Utilities.getUuid().replace(/-/g, '');
    var eventId = 'evt_' + editToken.substring(0, 8);

    var row = new Array(ctx.header.length).fill('');
    function set(name, value) {
      if (typeof ctx.idx[name] === 'number') row[ctx.idx[name]] = value;
    }
    set('Date Submitted', Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HH:mm'));
    set('Source', 'bulk-import-2026-09-08');
    set('Event ID', eventId);
    set('Edit Token', editToken);
    for (var k in ev) if (ev.hasOwnProperty(k)) set(k, ev[k]);
    // Fallback: default Submitter Email = Contact Email if missing
    if (typeof ctx.idx['Submitter Email'] === 'number' && !row[ctx.idx['Submitter Email']]) {
      row[ctx.idx['Submitter Email']] = String(ev['Contact Email'] || '').trim();
    }

    ctx.sheet.appendRow(row);
    appended++;
  }

  purgeCalendarCache();
  Logger.log('Imported ' + appended + ' event rows.');
  return { ok: true, appended: appended };
}

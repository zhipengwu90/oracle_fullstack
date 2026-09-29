-- Real starter content for the portfolio tables, migrated from the
-- my-portfolio project (bio, experience, projects) instead of using
-- placeholder text. Run portfolio_schema.sql first.
--
-- The image paths referenced below (e.g. 'portfolio/projects/chatbot.png')
-- are resolved relative to MEDIA_ROOT (backend/media/). backend/media/ is
-- gitignored (it's where end-user uploads land), so the actual image files
-- are tracked instead at sql/seed_images/, mirroring the same layout. On
-- this machine they're already copied into backend/media/ and everything
-- just works; on a fresh checkout (e.g. the VM), copy them over once:
--
--   cp -r oracle-backend/sql/seed_images/portfolio oracle-backend/backend/media/
--
-- After that, all images work immediately - no manual re-upload needed.
-- You can still replace/update/delete any of them later from Django Admin.

-- ---------------------------------------------------------------------
-- Profile (singleton)
-- ---------------------------------------------------------------------
INSERT INTO portfolio_profile
    (full_name, role_title, hero_heading, hero_bio, about_heading, about_bio,
     hero_image, about_image, email, location, resume_url)
VALUES (
    'Zhipeng Wu',
    'Data Technician & Full-Stack Developer',
    'Building Data Tools for Science',
    'I work at Fisheries and Oceans Canada designing data pipelines, database schemas, and web applications that make scientific data accessible. I build ETL tools in R Shiny, REST APIs in Django, and user-facing frontends in Next.js — connecting raw field data to the researchers who need it.',
    'About Me',
    E'I''m Wu, a Data Technician at Fisheries and Oceans Canada (DFO) and a full-stack developer. I build data pipelines, database systems, and web applications that turn complex scientific data into accessible tools for researchers and analysts. My current work spans R Shiny ETL tools, Django/PostgreSQL APIs, and Next.js frontends — all in support of salmon population and genetic data management.\n\nI have a strong passion for technology and a keen eye for detail. I enjoy bridging the gap between data engineering and user-facing software — making it easier for domain experts to work with their data without needing to be developers themselves.',
    'portfolio/profile/developer.svg',
    'portfolio/profile/about_me.svg',
    'zhipengwu90@gmail.com',
    'Nanaimo, BC',
    NULL
);

-- ---------------------------------------------------------------------
-- Stats (About page counters)
-- ---------------------------------------------------------------------
INSERT INTO portfolio_stat (label, value, suffix, display_order) VALUES
    ('Projects', 20, '+', 1),
    ('Years at DFO', 3, '+', 2),
    ('Technologies', 5, '+', 3);

-- ---------------------------------------------------------------------
-- Skills (hero badges + About page skill grid)
-- ---------------------------------------------------------------------
INSERT INTO portfolio_skill (name, category, is_featured, display_order) VALUES
    ('Python', 'Language', TRUE, 1),
    ('R', 'Language', TRUE, 2),
    ('Django', 'Framework', TRUE, 3),
    ('PostgreSQL', 'Database', TRUE, 4),
    ('Next.js', 'Framework', TRUE, 5),
    ('TypeScript', 'Language', TRUE, 6),
    ('AI', 'Tool', FALSE, 7),
    ('Bootstrap', 'Framework', FALSE, 8),
    ('CSS', 'Language', FALSE, 9),
    ('Electron', 'Framework', FALSE, 10),
    ('Express.js', 'Framework', FALSE, 11),
    ('Firebase', 'Database', FALSE, 12),
    ('HTML', 'Language', FALSE, 13),
    ('JavaScript', 'Language', FALSE, 14),
    ('Node.js', 'Runtime', FALSE, 15),
    ('OCR', 'Tool', FALSE, 16),
    ('OpenAI', 'Tool', FALSE, 17),
    ('Oracle', 'Database', FALSE, 18),
    ('PHP', 'Language', FALSE, 19),
    ('R-Shiny', 'Framework', FALSE, 20),
    ('React', 'Framework', FALSE, 21),
    ('React Native', 'Framework', FALSE, 22),
    ('Supabase', 'Database', FALSE, 23),
    ('TailwindCSS', 'Framework', FALSE, 24),
    ('Web Design', 'Tool', FALSE, 25),
    ('WordPress', 'Platform', FALSE, 26);

-- ---------------------------------------------------------------------
-- Experience (most recent first)
-- ---------------------------------------------------------------------
INSERT INTO portfolio_experience
    (position, company, company_url, location, start_date, end_date, description, display_order)
VALUES
    ('Aquatic Science Technician', 'Fisheries and Oceans Canada', 'https://www.dfo-mpo.gc.ca/index-eng.html', 'Nanaimo, BC',
     '2023-11-01', NULL,
     'Conducted comprehensive data compilation, analysis, and quality assurance/quality control (QA/QC) using Microsoft Access and SQL queries for database uploading.Provided technical support for scientific field and projects, playing a key role in fish stock assessment.Maintained custodianship over the NuSEDS database, effectively managing and keeping up its data for use in scientific research and projects.',
     1),
    ('Data Technician', 'Fisheries and Oceans Canada', 'https://www.dfo-mpo.gc.ca/index-eng.html', 'Nanaimo, BC',
     '2022-11-01', '2023-03-01',
     'Conducted comprehensive data compilation, analysis, and uploading using SQL queries into the database. Provided technical support for scientific field and projects, playing a key role in fish stock assessment.',
     2),
    ('Saltwater Production Site Manager', 'Cermaq Canada', 'https://www.cermaq.ca/', 'Tofino, BC',
     '2019-10-01', '2021-05-01',
     'Responsible leading a team through general husbandry operations, ensuring a healthy lifecycle of fish from smolt intakes, growth to harvest. Implement, monitor and report on programs that improve the health and safety of the work team and of the salmon with the goal of meeting and exceeding regulatory compliance. Utilization of analytical skills to collect data',
     3),
    ('Saltwater Production Assistant Manager', 'Cermaq Canada', 'https://www.cermaq.ca/', 'Tofino, BC',
     '2019-10-01', '2021-05-01',
     'Responsible leading a team through general husbandry operations, ensuring a healthy lifecycle of fish from smolt intakes, growth to harvest. Implement, monitor and report on programs that improve the health and safety of the work team and of the salmon with the goal of meeting and exceeding regulatory compliance. Utilization of analytical skills to collect data',
     4),
    ('Saltwater Lead hand/Technician', 'Cermaq Canada', 'https://www.cermaq.ca/', 'Tofino, BC',
     '2014-01-01', '2019-05-01',
     'Providing support to the seasite through husbandry operations to ensure a healthy lifecycle of the salmon from smolt to harvest',
     5),
    ('IT Service Desk', 'Dalhousie University', 'https://www.dal.ca/', 'Truro, NS',
     '2012-09-01', '2013-12-01',
     'Providing technical assistance and support to faculty, staff, and students, such as general computer troubleshooting, application/software support, printing support, and password support. Preparing and maintaining computer equipment and related technologies in the library and computer room.',
     6);

-- ---------------------------------------------------------------------
-- Projects (curated order preserved from the original portfolio)
-- ---------------------------------------------------------------------
INSERT INTO portfolio_project
    (title, slug, description, image, project_url, github_url, app_store_url, is_internal, is_in_progress, display_order)
VALUES
    ('Data Extraction Tool', 'data-extraction-tool',
     'An R Shiny application built for Fisheries and Oceans Canada that connects to an Oracle database. Users upload a Microsoft Access database and the tool performs ETL — extracting, transforming, and outputting data in the correct format required for scientific workflows.',
     'portfolio/projects/dfo-data-extraction.svg', NULL, NULL, NULL, TRUE, FALSE, 1),

    ('Salmon Population Summary Repository (SPSR)', 'salmon-population-summary-repository',
     'A Django application for browsing, exporting, and uploading salmon population summary data and metadata. Supports six public data routes (Population, CU, SMU, Indicator, PFMA, Status/Composite), Salmon Data Package uploads and exports, a read-only REST API with OpenAPI/Swagger docs, and assessment-aware versioning.',
     'portfolio/projects/dfo-spsr.svg', NULL, NULL, NULL, TRUE, FALSE, 2),

    ('Genetic Results Database', 'genetic-results-database',
     'In progress — a PostgreSQL database schema redesigned to handle both historical and new genetic data across different formats for Fisheries and Oceans Canada. A Next.js frontend will allow users to query and export data in the format they need.',
     'portfolio/projects/dfo-genetics.svg', NULL, NULL, NULL, TRUE, TRUE, 3),

    ('Receipt Tracker', 'receipt-tracker',
     'A mobile app that scans receipts using OCR and AI to automatically extract the merchant, total, and category — then organizes, analyzes, and exports your spending with charts and reports. Built with React Native; available on the App Store.',
     'portfolio/projects/receipt-tracker.svg', 'https://receipt-tracker-dun.vercel.app', NULL,
     'https://apps.apple.com/ca/app/receipt-tracker/id6754727047', FALSE, FALSE, 4),

    ('Inventory App', 'inventory-app',
     'A business inventory management app that tracks stock levels and automatically generates shopping lists from low-stock items. Built with Next.js and TypeScript, backed by a Supabase Postgres database with real-time sync.',
     'portfolio/projects/inventory-app.svg', 'https://inventory-app-topaz-one.vercel.app',
     'https://github.com/zhipengwu90/inventory-app', NULL, FALSE, FALSE, 5),

    ('Brazen Poppy Bakery', 'brazen-poppy-bakery',
     E'A marketing website for Brazen Poppy, a café and bakery in Parksville, BC — featuring their menu, hours, location, and story. Built with Next.js and TailwindCSS, deployed on Vercel.',
     'portfolio/projects/brazen-poppy.svg', 'https://brazenpoppy.ca', NULL, NULL, FALSE, FALSE, 6),

    ('Notes.ai V3.0', 'notes-ai-v3',
     E'A mac OS application that uses OpenAI whisper model to generate notes from the user''s voice. The app is built with React, Python, Node.js, and Electron. Version 2.0 is available on the App Store.',
     'portfolio/projects/Notesai.png', NULL, NULL,
     'https://apps.apple.com/us/app/notes-ai/id6477414161', FALSE, FALSE, 7),

    (E'Wu''s Portfolio V2.0', 'wus-portfolio-v2',
     'A personal portfolio website built with React and TypeScript. Responsive and mobile-friendly.',
     'portfolio/projects/portfolio.png', 'https://wu-portfolio.vercel.app/',
     'https://github.com/zhipengwu90/wuPortfolio', NULL, FALSE, FALSE, 8),

    ('Hands On', 'hands-on',
     'A mobile application that connects busy people with reliable helpers in their local area. Built with React Native and Expo; backend with Node.js, Express.js, and Firebase.',
     'portfolio/projects/hands_on.png', NULL, 'https://github.com/zhipengwu90/Hands_On_app', NULL, FALSE, FALSE, 9),

    ('Chatbot', 'chatbot',
     'A personal ChatGPT interface using the OpenAI API and Vercel Edge functions with streaming. Users bring their own API key and can switch between models without a ChatGPT Plus subscription. Built with Next.js and TypeScript.',
     'portfolio/projects/chatbot.png', 'https://www.wuapp.app/', 'https://github.com/zhipengwu90/Chatbot', NULL, FALSE, FALSE, 10),

    ('VFriend', 'vfriend',
     'A mobile application that lets users create and interact with virtual characters. Built with React Native and Expo, integrated with the OpenAI API.',
     'portfolio/projects/VFriend.png', NULL, 'https://github.com/zhipengwu90/VFriend', NULL, FALSE, FALSE, 11),

    ('Fever Scanner', 'fever-scanner',
     E'A Raspberry Pi project that uses a thermal imaging camera to monitor users'' body temperature. Users scan their NFC tags to identify themselves, which triggers the camera to capture and record their temperature.',
     'portfolio/projects/FeverScanner.png', NULL, 'https://github.com/zhipengwu90/FeverScanner', NULL, FALSE, FALSE, 12),

    ('Dream House', 'dream-house',
     'A responsive real-estate showcase website built with HTML, CSS, Bootstrap, and JavaScript.',
     'portfolio/projects/dream_house.png', 'https://zhipengwu90.github.io/ITAS191/index.html',
     'https://github.com/zhipengwu90/zhipengwu90.github.io/tree/main/ITAS191', NULL, FALSE, FALSE, 13),

    (E'Wu''s Portfolio', 'wus-portfolio-v1',
     'Version 1 of my portfolio website, built with HTML, CSS, and JavaScript. Responsive and mobile-friendly.',
     'portfolio/projects/portfolioV1.png', 'https://zhipengwu90.github.io/index.html',
     'https://github.com/zhipengwu90/zhipengwu90.github.io', NULL, FALSE, FALSE, 14),

    ('Canada Market', 'canada-market',
     'A house-hunting website built with WordPress. Responsive and mobile-friendly.',
     'portfolio/projects/CanadaMarket.png', NULL, NULL, NULL, FALSE, FALSE, 15);

-- ---------------------------------------------------------------------
-- Tags (project filter vocabulary)
-- ---------------------------------------------------------------------
INSERT INTO portfolio_tag (name, slug) VALUES
    ('Python', 'python'),
    ('R', 'r'),
    ('R-Shiny', 'r-shiny'),
    ('Oracle', 'oracle'),
    ('Django', 'django'),
    ('PostgreSQL', 'postgresql'),
    ('Next.js', 'nextjs'),
    ('TypeScript', 'typescript'),
    ('React Native', 'react-native'),
    ('OCR', 'ocr'),
    ('AI', 'ai'),
    ('Supabase', 'supabase'),
    ('TailwindCSS', 'tailwindcss'),
    ('Web Design', 'web-design'),
    ('React', 'react'),
    ('Node.js', 'nodejs'),
    ('Electron', 'electron'),
    ('Firebase', 'firebase'),
    ('Express.js', 'expressjs'),
    ('OpenAI', 'openai'),
    ('JavaScript', 'javascript'),
    ('HTML', 'html'),
    ('CSS', 'css'),
    ('Bootstrap', 'bootstrap'),
    ('WordPress', 'wordpress'),
    ('PHP', 'php');

-- ---------------------------------------------------------------------
-- Project <-> tag mapping (looked up by slug/name, not hardcoded ids)
-- ---------------------------------------------------------------------
INSERT INTO portfolio_project_tag (project_id, tag_id)
SELECT p.id, t.id
FROM (VALUES
    ('data-extraction-tool', 'R'),
    ('data-extraction-tool', 'R-Shiny'),
    ('data-extraction-tool', 'Oracle'),

    ('salmon-population-summary-repository', 'Django'),
    ('salmon-population-summary-repository', 'PostgreSQL'),
    ('salmon-population-summary-repository', 'Python'),

    ('genetic-results-database', 'PostgreSQL'),
    ('genetic-results-database', 'Next.js'),
    ('genetic-results-database', 'TypeScript'),

    ('receipt-tracker', 'React Native'),
    ('receipt-tracker', 'OCR'),
    ('receipt-tracker', 'AI'),

    ('inventory-app', 'Next.js'),
    ('inventory-app', 'Supabase'),
    ('inventory-app', 'TypeScript'),

    ('brazen-poppy-bakery', 'Next.js'),
    ('brazen-poppy-bakery', 'TailwindCSS'),
    ('brazen-poppy-bakery', 'Web Design'),

    ('notes-ai-v3', 'React'),
    ('notes-ai-v3', 'Python'),
    ('notes-ai-v3', 'Node.js'),
    ('notes-ai-v3', 'Electron'),

    ('wus-portfolio-v2', 'React'),
    ('wus-portfolio-v2', 'TypeScript'),

    ('hands-on', 'React Native'),
    ('hands-on', 'Firebase'),
    ('hands-on', 'Node.js'),
    ('hands-on', 'Express.js'),

    ('chatbot', 'Next.js'),
    ('chatbot', 'TypeScript'),
    ('chatbot', 'OpenAI'),

    ('vfriend', 'React Native'),
    ('vfriend', 'Firebase'),
    ('vfriend', 'OpenAI'),

    ('fever-scanner', 'Python'),

    ('dream-house', 'JavaScript'),
    ('dream-house', 'HTML'),
    ('dream-house', 'CSS'),
    ('dream-house', 'Bootstrap'),

    ('wus-portfolio-v1', 'JavaScript'),
    ('wus-portfolio-v1', 'HTML'),
    ('wus-portfolio-v1', 'CSS'),
    ('wus-portfolio-v1', 'Bootstrap'),

    ('canada-market', 'WordPress'),
    ('canada-market', 'PHP'),
    ('canada-market', 'HTML'),
    ('canada-market', 'CSS')
) AS pt(project_slug, tag_name)
JOIN portfolio_project p ON p.slug = pt.project_slug
JOIN portfolio_tag t ON t.name = pt.tag_name;

-- ---------------------------------------------------------------------
-- Social links (nav/footer)
-- ---------------------------------------------------------------------
INSERT INTO portfolio_social_link (platform, label, url, display_order) VALUES
    ('github', 'GitHub', 'https://github.com/zhipengwu90', 1),
    ('linkedin', 'LinkedIn', 'https://www.linkedin.com/in/zhipengwu90', 2),
    ('email', 'Email', 'mailto:zhipengwu90@gmail.com', 3);

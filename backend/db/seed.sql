-- seed.sql
-- Local development fixture only. Two islands per route slot (so routes
-- actually vary), four question domains with two questions each, and the
-- event left un-started so /admin/start is part of the smoke test.
-- Never run this against the production project.

insert into public.islands (name, "order", correct_code, clue_statement, clue_images, is_terminal) values
  ('Tatooine',        1, 'TATO-1', 'Twin suns. Find the dome where the oldest scans are kept and read the plate by its door.', '[]', false),
  ('Kanto',           1, 'KANT-1', 'A crossroads of four paths. The code is stencilled under the bench that faces the fountain.', '[]', false),
  ('Hyperspace',      2, 'HYPE-2', 'Where the corridor narrows and hums, look up. The code is on the third light fitting.', '[]', false),
  ('Galvan Prime',    2, 'GALV-2', 'Ten fingers, one mind. The code is written where the lab keeps its spare gloves.', '[]', false),
  ('Miller''s Planet',3, 'MILL-3', 'Every hour here is seven years. The clock on the far wall has the code in place of twelve.', '[]', false),
  ('Xandar',          3, 'XAND-3', 'The Nova Corps keep their ledger by the east stairwell. Last entry, first column.', '[]', false),
  ('Bifrost',         4, 'BIFR-4', 'The bridge between worlds is painted on the floor. Follow it to the pillar with the plaque.', '[]', false),
  ('Heaven',          4, 'HEAV-4', 'The highest point you can reach without a key. The code faces the sunset.', '[]', false),
  ('The Null Void',   5, 'VOID-5', 'All beacons fall silent. Nothing between you and the Null Void but the hull and the dark. The master key is inside.', '[]', true),
  ('The Event Horizon',5,'HORI-5', 'Past this line nothing returns. Present yourselves to the marshal at the threshold.', '[]', true)
on conflict do nothing;

insert into public.questions (domain, question_statement, question_answer, que_img) values
  ('space',   'A signal leaves a relay and reaches you 8 minutes later. Roughly how far away is the relay, in millions of km?', '144', '[]'),
  ('space',   'How many planets in this solar system have rings visible from Earth with a small telescope?', '1', '[]'),
  ('quantum', 'The pulse needs three bearings to triangulate. You have two. How many more readings are required?', '1', '[]'),
  ('quantum', 'A qubit is measured. How many classical bits of information do you get out?', '1', '[]'),
  ('mytho',   'Four fragments, each a quarter of the targeting data. Three are recovered. What percentage remains?', '25', '[]'),
  ('mytho',   'Odysseus sailed home for how many years after the fall of Troy?', '10', '[]'),
  ('physics', 'An observatory in permanent shadow sees the burst begin at 04:12 and end at 04:47. How many minutes did it last?', '35', '[]'),
  ('physics', 'Light takes about how many seconds to travel from the Moon to Earth? Round to the nearest whole second.', '1', '[]')
on conflict do nothing;

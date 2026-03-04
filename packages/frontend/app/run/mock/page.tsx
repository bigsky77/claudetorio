import type { Metadata } from 'next';
import type { RunInfo, RunStepInfo } from '@/interfaces';
import RunDetailClient from '@/components/RunDetail/RunDetailClient';

export const metadata: Metadata = {
  title: 'Mock Run',
};

const MOCK_RUN: RunInfo = {
  run_id: 'run-demo-2026-02-19',
  status: 'running',
  created_at: new Date(Date.now() - 3600_000).toISOString(),
  started_at: new Date(Date.now() - 3000_000).toISOString(),
  ended_at: null,
  slot: 0,
  task_key: 'open_play',
  model: 'claude-opus-4-6',
  max_steps: 100,
  step_timeout_seconds: 120,
  error: null,
  final_score: null,
  step_count: 12,
  stream_url: null,
};

const MOCK_STEPS: RunStepInfo[] = [
  {
    id: 1, run_id: MOCK_RUN.run_id, step_idx: 0,
    created_at: new Date(Date.now() - 2800_000).toISOString(),
    code: `-- Bootstrap: Place initial mining drills and furnaces\nlocal player = game.players[1]\nlocal surface = player.surface\n\n-- Place a burner mining drill on iron ore\nlocal drill = surface.create_entity{\n  name = "burner-mining-drill",\n  position = {x = -28, y = -16},\n  force = player.force\n}\n\n-- Place a stone furnace next to the drill\nlocal furnace = surface.create_entity{\n  name = "stone-furnace",\n  position = {x = -26, y = -16},\n  force = player.force\n}`,
    result: 'Placed burner-mining-drill at (-28, -16)\nPlaced stone-furnace at (-26, -16)',
    error_occurred: false, reward: 0.5, production_score: 12, ticks: 3600, token_usage: { input_tokens: 1200, output_tokens: 450 }, achievements: null, observation_summary: null,
  },
  {
    id: 2, run_id: MOCK_RUN.run_id, step_idx: 1,
    created_at: new Date(Date.now() - 2600_000).toISOString(),
    code: `-- Add coal to fuel the drill and furnace\nlocal drill = game.surfaces[1].find_entity("burner-mining-drill", {x=-28, y=-16})\nlocal furnace = game.surfaces[1].find_entity("stone-furnace", {x=-26, y=-16})\n\ndrill.insert({name="coal", count=20})\nfurnace.insert({name="coal", count=20})`,
    result: 'Inserted fuel into drill and furnace successfully',
    error_occurred: false, reward: 0.3, production_score: 18, ticks: 7200, token_usage: { input_tokens: 1400, output_tokens: 380 }, achievements: null, observation_summary: null,
  },
  {
    id: 3, run_id: MOCK_RUN.run_id, step_idx: 2,
    created_at: new Date(Date.now() - 2400_000).toISOString(),
    code: `-- Place inserters to automate coal feeding\nlocal player = game.players[1]\nlocal surface = player.surface\n\nsurface.create_entity{\n  name = "burner-inserter",\n  position = {x = -27, y = -16},\n  direction = defines.direction.west,\n  force = player.force\n}`,
    result: 'Placed burner-inserter at (-27, -16)',
    error_occurred: false, reward: 0.8, production_score: 45, ticks: 10800, token_usage: { input_tokens: 1500, output_tokens: 420 }, achievements: null, observation_summary: null,
  },
  {
    id: 4, run_id: MOCK_RUN.run_id, step_idx: 3,
    created_at: new Date(Date.now() - 2200_000).toISOString(),
    code: `-- Build transport belt line from furnace to central collection\nlocal surface = game.surfaces[1]\nlocal player = game.players[1]\n\nfor x = -25, -18 do\n  surface.create_entity{\n    name = "transport-belt",\n    position = {x = x, y = -16},\n    direction = defines.direction.east,\n    force = player.force\n  }\nend`,
    result: 'Placed 8 transport belts from (-25,-16) to (-18,-16)',
    error_occurred: false, reward: 1.2, production_score: 89, ticks: 14400, token_usage: { input_tokens: 1800, output_tokens: 500 }, achievements: null, observation_summary: null,
  },
  {
    id: 5, run_id: MOCK_RUN.run_id, step_idx: 4,
    created_at: new Date(Date.now() - 2000_000).toISOString(),
    code: `-- Error: trying to place on water\nlocal surface = game.surfaces[1]\nsurface.create_entity{\n  name = "offshore-pump",\n  position = {x = 0, y = 0},\n  force = game.players[1].force\n}`,
    result: 'Error: cannot place offshore-pump at (0,0) - no water tile found',
    error_occurred: true, reward: -0.5, production_score: 89, ticks: 18000, token_usage: { input_tokens: 1100, output_tokens: 200 }, achievements: null, observation_summary: null,
  },
  {
    id: 6, run_id: MOCK_RUN.run_id, step_idx: 5,
    created_at: new Date(Date.now() - 1800_000).toISOString(),
    code: `-- Find water and place offshore pump correctly\nlocal surface = game.surfaces[1]\nlocal water_tiles = surface.find_tiles_filtered{\n  name = "water",\n  area = {{-100,-100},{100,100}},\n  limit = 1\n}\nlocal pos = water_tiles[1].position\nsurface.create_entity{\n  name = "offshore-pump",\n  position = pos,\n  force = game.players[1].force\n}`,
    result: 'Found water at (42, -8). Placed offshore-pump successfully.',
    error_occurred: false, reward: 1.5, production_score: 156, ticks: 21600, token_usage: { input_tokens: 2100, output_tokens: 520 }, achievements: null, observation_summary: null,
  },
  {
    id: 7, run_id: MOCK_RUN.run_id, step_idx: 6,
    created_at: new Date(Date.now() - 1600_000).toISOString(),
    code: `-- Build boiler + steam engine for power generation\nlocal surface = game.surfaces[1]\nlocal player = game.players[1]\n\nlocal boiler = surface.create_entity{\n  name = "boiler",\n  position = {x = 44, y = -8},\n  direction = defines.direction.east,\n  force = player.force\n}\nlocal engine = surface.create_entity{\n  name = "steam-engine",\n  position = {x = 47, y = -8},\n  direction = defines.direction.east,\n  force = player.force\n}`,
    result: 'Placed boiler at (44,-8) and steam-engine at (47,-8). Power network established: 900kW capacity.',
    error_occurred: false, reward: 2.1, production_score: 312, ticks: 25200, token_usage: { input_tokens: 2400, output_tokens: 600 }, achievements: null, observation_summary: null,
  },
  {
    id: 8, run_id: MOCK_RUN.run_id, step_idx: 7,
    created_at: new Date(Date.now() - 1400_000).toISOString(),
    code: `-- Scale up iron production: 4 electric mining drills\nlocal surface = game.surfaces[1]\nlocal player = game.players[1]\n\nlocal positions = {{-30,-20},{-28,-20},{-30,-18},{-28,-18}}\nfor _, pos in ipairs(positions) do\n  surface.create_entity{\n    name = "electric-mining-drill",\n    position = {x=pos[1], y=pos[2]},\n    force = player.force\n  }\nend`,
    result: 'Placed 4 electric mining drills on iron ore patch. Iron production rate: 2.5/s',
    error_occurred: false, reward: 1.8, production_score: 520, ticks: 28800, token_usage: { input_tokens: 2000, output_tokens: 480 }, achievements: null, observation_summary: null,
  },
  {
    id: 9, run_id: MOCK_RUN.run_id, step_idx: 8,
    created_at: new Date(Date.now() - 1200_000).toISOString(),
    code: `-- Set up copper mining and smelting line\nlocal surface = game.surfaces[1]\nlocal player = game.players[1]\n\n-- Find copper ore\nlocal copper = surface.find_entities_filtered{\n  name = "copper-ore", area = {{-100,-100},{100,100}}, limit = 1\n}\nlocal copper_pos = copper[1].position\n\n-- Place drills and furnaces\nfor i = 0, 3 do\n  surface.create_entity{\n    name = "electric-mining-drill",\n    position = {x=copper_pos.x + i*3, y=copper_pos.y},\n    force = player.force\n  }\n  surface.create_entity{\n    name = "stone-furnace",\n    position = {x=copper_pos.x + i*3, y=copper_pos.y + 3},\n    force = player.force\n  }\nend`,
    result: 'Copper mining line established at (15, 22). 4 drills + 4 furnaces. Copper plate production: 1.8/s',
    error_occurred: false, reward: 2.5, production_score: 890, ticks: 32400, token_usage: { input_tokens: 2800, output_tokens: 700 }, achievements: null, observation_summary: null,
  },
  {
    id: 10, run_id: MOCK_RUN.run_id, step_idx: 9,
    created_at: new Date(Date.now() - 1000_000).toISOString(),
    code: `-- Research automation technology\nlocal player = game.players[1]\nlocal force = player.force\n\n-- Place lab and insert science packs\nlocal lab = game.surfaces[1].create_entity{\n  name = "lab",\n  position = {x = 0, y = 0},\n  force = force\n}\nlab.insert({name = "automation-science-pack", count = 50})\nforce.research_queue_enabled = true\nforce.add_research("automation")`,
    result: 'Lab placed. Researching: Automation (10% complete). ETA: 120 ticks.',
    error_occurred: false, reward: 3.0, production_score: 1250, ticks: 36000, token_usage: { input_tokens: 2200, output_tokens: 550 }, achievements: null, observation_summary: null,
  },
  {
    id: 11, run_id: MOCK_RUN.run_id, step_idx: 10,
    created_at: new Date(Date.now() - 800_000).toISOString(),
    code: `-- Build assembling machines for automation science packs\nlocal surface = game.surfaces[1]\nlocal player = game.players[1]\n\n-- Assembler 1: Iron gear wheels\nlocal asm1 = surface.create_entity{\n  name = "assembling-machine-1",\n  position = {x = -10, y = 0},\n  force = player.force\n}\nasm1.set_recipe("iron-gear-wheel")\n\n-- Assembler 2: Automation science packs\nlocal asm2 = surface.create_entity{\n  name = "assembling-machine-1",\n  position = {x = -7, y = 0},\n  force = player.force\n}\nasm2.set_recipe("automation-science-pack")`,
    result: 'Assembling machines placed. Gear wheel production: 1/s. Science pack production: 0.5/s',
    error_occurred: false, reward: 2.8, production_score: 1890, ticks: 39600, token_usage: { input_tokens: 2600, output_tokens: 620 }, achievements: null, observation_summary: null,
  },
  {
    id: 12, run_id: MOCK_RUN.run_id, step_idx: 11,
    created_at: new Date(Date.now() - 600_000).toISOString(),
    code: `-- Optimize: Add more power and expand belt network\nlocal surface = game.surfaces[1]\nlocal player = game.players[1]\n\n-- Second steam engine\nsurface.create_entity{\n  name = "steam-engine",\n  position = {x = 50, y = -8},\n  direction = defines.direction.east,\n  force = player.force\n}\n\n-- Main bus: iron plates belt\nfor x = -18, 0 do\n  surface.create_entity{\n    name = "transport-belt",\n    position = {x = x, y = -14},\n    direction = defines.direction.east,\n    force = player.force\n  }\nend\n\n-- Connect copper line to main bus\nfor y = -14, 20 do\n  surface.create_entity{\n    name = "transport-belt",\n    position = {x = 1, y = y},\n    direction = defines.direction.north,\n    force = player.force\n  }\nend`,
    result: 'Power expanded to 1.8MW. Main bus established with 19 iron belts + 35 copper feed belts. Factory throughput improved.',
    error_occurred: false, reward: 3.5, production_score: 2847, ticks: 43200, token_usage: { input_tokens: 3200, output_tokens: 800 }, achievements: null, observation_summary: null,
  },
];

export default function MockRunPage() {
  return (
    <RunDetailClient
      initialRun={MOCK_RUN}
      initialSteps={MOCK_STEPS}
      streamUrl=""
    />
  );
}

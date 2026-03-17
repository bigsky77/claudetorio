# Factorio Learning Environment (FLE) API Reference

You control a Factorio game through Python code executed via the `mcp__factorio-fle__execute` tool.
All API types and functions are pre-imported — do not import anything.

## MCP Tools

- `mcp__factorio-fle__execute` — Run Python code in the game
- `mcp__factorio-fle__render(center_x, center_y)` — Screenshot the map (defaults to 0,0)
- `mcp__factorio-fle__reconnect` — Reconnect to the Factorio server
- `mcp__factorio-fle__commit(tag_name, message)` — Save a named checkpoint
- `mcp__factorio-fle__restore(ref)` — Restore to a checkpoint or commit ID
- `mcp__factorio-fle__undo` — Undo last code execution
- `mcp__factorio-fle__view_history(limit)` — View commit history
- `mcp__factorio-fle__list_tags` — List named checkpoints

## Core Types

### Position
```python
Position(x=0.0, y=0.0)
```

### Direction
```python
Direction.UP    # North
Direction.DOWN  # South
Direction.LEFT  # West
Direction.RIGHT # East
```

### Resource (for resource patches)
```python
Resource.Coal, Resource.IronOre, Resource.CopperOre,
Resource.Stone, Resource.UraniumOre, Resource.CrudeOil,
Resource.Water, Resource.Wood
```

### Prototype (items, buildings, intermediates)
Key prototypes:
```python
# Mining & Smelting
Prototype.BurnerMiningDrill, Prototype.ElectricMiningDrill
Prototype.StoneFurnace, Prototype.SteelFurnace, Prototype.ElectricFurnace

# Logistics
Prototype.TransportBelt, Prototype.FastTransportBelt, Prototype.ExpressTransportBelt
Prototype.UndergroundBelt, Prototype.FastUndergroundBelt, Prototype.ExpressUndergroundBelt
Prototype.Splitter, Prototype.FastSplitter, Prototype.ExpressSplitter
Prototype.BurnerInserter, Prototype.Inserter, Prototype.LongHandedInserter
Prototype.FastInserter, Prototype.FilterInserter, Prototype.StackInserter

# Power
Prototype.Boiler, Prototype.SteamEngine, Prototype.SolarPanel, Prototype.Accumulator
Prototype.OffshorePump, Prototype.SmallElectricPole, Prototype.MediumElectricPole
Prototype.BigElectricPole

# Production
Prototype.AssemblingMachine1, Prototype.AssemblingMachine2, Prototype.AssemblingMachine3
Prototype.ChemicalPlant, Prototype.OilRefinery, Prototype.Lab, Prototype.RocketSilo
Prototype.Centrifuge, Prototype.PumpJack

# Intermediates
Prototype.IronPlate, Prototype.CopperPlate, Prototype.SteelPlate
Prototype.IronGearWheel, Prototype.IronStick, Prototype.CopperCable
Prototype.ElectronicCircuit, Prototype.AdvancedCircuit, Prototype.ProcessingUnit
Prototype.Pipe, Prototype.EngineUnit, Prototype.ElectricEngineUnit

# Science
Prototype.AutomationSciencePack, Prototype.LogisticsSciencePack
Prototype.ChemicalSciencePack, Prototype.MilitarySciencePack
Prototype.ProductionSciencePack, Prototype.UtilitySciencePack
Prototype.SpaceSciencePack

# Storage
Prototype.WoodenChest, Prototype.IronChest, Prototype.SteelChest
Prototype.StorageTank

# Other
Prototype.Pipe, Prototype.UndergroundPipe, Prototype.Pump
Prototype.Radar, Prototype.StoneWall, Prototype.Gate
Prototype.Concrete, Prototype.StoneBrick
Prototype.Rail, Prototype.GunTurret
```

### Technology
```python
Technology.Automation, Technology.Automation2, Technology.Automation3
Technology.Logistics, Technology.Logistics2, Technology.Logistics3
Technology.SteelProcessing, Technology.AdvancedMaterialProcessing
Technology.Electronics, Technology.AdvancedElectronics, Technology.AdvancedElectronics2
Technology.OilProcessing, Technology.AdvancedOilProcessing
Technology.LogisticsSciencePack, Technology.ChemicalSciencePack
Technology.MilitarySciencePack, Technology.ProductionSciencePack
Technology.SolarEnergy, Technology.ElectricEnergy, Technology.ElectricEnergy2
Technology.FastInserter, Technology.StackInserter
Technology.Robotics, Technology.RocketSiloTechnology, Technology.SpaceScience
# ... and more
```

### EntityStatus (checked via entity.status)
```python
EntityStatus.WORKING              # Operating normally
EntityStatus.NO_FUEL              # Needs fuel (burner entities)
EntityStatus.NO_POWER             # Not receiving electricity
EntityStatus.LOW_POWER            # Insufficient electricity
EntityStatus.NO_INGREDIENTS       # Waiting for input items
EntityStatus.NO_RECIPE            # Assembler has no recipe set
EntityStatus.FULL_OUTPUT          # Output is blocked/full
EntityStatus.NO_MINABLE_RESOURCES # Drill has nothing to mine
EntityStatus.ITEM_INGREDIENT_SHORTAGE
EntityStatus.FLUID_INGREDIENT_SHORTAGE
EntityStatus.MISSING_REQUIRED_FLUID
EntityStatus.WAITING_FOR_SOURCE_ITEMS
EntityStatus.WAITING_FOR_SPACE_IN_DESTINATION
EntityStatus.NOT_PLUGGED_IN_ELECTRIC_NETWORK
EntityStatus.NO_RESEARCH_IN_PROGRESS
EntityStatus.MISSING_SCIENCE_PACKS
EntityStatus.NORMAL
# ... and more
```

## API Functions

### Movement & Harvesting

```python
move_to(position: Position, laying: Prototype = None, leading: Prototype = None) -> Position
```
Move the player to a position. Optionally lay entities (e.g. belts/pipes) along the path.

```python
harvest_resource(position: Position, quantity=1, radius=10) -> int
```
Manually harvest resources at a position. Returns amount harvested.

### Finding Things

```python
nearest(type: Prototype | Resource) -> Position
```
Find the nearest resource patch or entity of a given type.

```python
get_resource_patch(resource: Resource, position: Position, radius=30) -> ResourcePatch
```
Get details about a resource patch. Returns object with `.name`, `.size`, `.bounding_box`.

```python
get_entities(entities: set[Prototype] = set(), position: Position = None, radius=1000) -> list[Entity]
```
Get placed entities. Filter by prototype set, position, and radius. Empty set = all entities.

```python
get_entity(entity: Prototype, position: Position) -> Entity
```
Get a specific entity at a position.

### Inventory

```python
inspect_inventory(entity=None, all_players=False) -> Inventory
```
Check inventory contents. No args = player inventory. Pass an entity to check its inventory.
Inventory supports `.items()`, `.keys()`, `.values()`, `[key]`, `.get(key)`.

```python
insert_item(entity: Prototype, target: Entity | EntityGroup, quantity=5) -> Entity
```
Insert items from player inventory into an entity (e.g. fuel into a drill).

```python
extract_item(entity: Prototype, source: Position | Entity, quantity=5) -> int
```
Extract items from an entity into player inventory.

### Placing & Managing Entities

```python
place_entity(entity: Prototype, direction: Direction = Direction.UP, position: Position = Position(0,0), exact=True) -> Entity
```
Place an entity at a position. Must have the item in inventory.

```python
place_entity_next_to(entity: Prototype, reference_position: Position, direction: Direction = Direction.RIGHT, spacing=0) -> Entity
```
Place an entity adjacent to a reference position in a given direction.

```python
can_place_entity(entity: Prototype, direction: Direction = Direction.UP, position: Position = Position(0,0)) -> bool
```
Check if an entity can be placed at a position.

```python
pickup_entity(entity: Entity | Prototype | EntityGroup, position: Position = None) -> bool
```
Pick up a placed entity back into inventory.

```python
rotate_entity(entity: Entity, direction: Direction) -> Entity
```
Rotate an entity to face a direction.

### Connections & Logistics

```python
connect_entities(source, target, connection_type: Prototype = Prototype.Pipe) -> int
```
Connect two entities with pipes, belts, power poles, etc. Source/target can be Position, Entity, or EntityGroup.

```python
get_connection_amount(source, target, connection_type: Prototype = Prototype.Pipe) -> int
```
Get the number of connections between two entities.

### Crafting & Recipes

```python
craft_item(entity: Prototype, quantity=1) -> int
```
Hand-craft an item. Only works for items the player can craft (not smelting/chemical recipes).

```python
get_prototype_recipe(prototype: Prototype | RecipeName | str) -> Recipe
```
Get the recipe for a prototype. Returns object with `.ingredients` list of `Ingredient(name, count, type)`.

```python
set_entity_recipe(entity: Entity, prototype: Prototype | RecipeName) -> Entity
```
Set the recipe on an assembling machine or chemical plant.

### Research

```python
set_research(technology: Technology) -> list[Ingredient]
```
Start researching a technology. Returns required science packs.

```python
get_research_progress(technology: Technology = None) -> list[Ingredient]
```
Check research progress. Returns remaining ingredients needed.

### Game State

```python
score() -> tuple
```
Get the current score (based on science production).

```python
sleep(seconds: int) -> bool
```
Advance the game by N seconds (lets machines work).

```python
send_message(message: str, recipient=None, metadata=None) -> bool
```
Send a message in the game.

```python
launch_rocket(silo: Position | RocketSilo) -> RocketSilo
```
Launch a rocket from a rocket silo.

### RecipeName (for fluid/special recipes)
```python
RecipeName.BasicOilProcessing, RecipeName.AdvancedOilProcessing
RecipeName.HeavyOilCracking, RecipeName.LightOilCracking
RecipeName.SolidFuelFromLightOil, RecipeName.SolidFuelFromHeavyOil
RecipeName.SolidFuelFromPetroleumGas
RecipeName.SulfuricAcid, RecipeName.CoalLiquefaction
RecipeName.UraniumProcessing, RecipeName.NuclearFuelReprocessing
RecipeName.FillCrudeOilBarrel, RecipeName.EmptyCrudeOilBarrel
# ... and barrel fill/empty variants for all fluids
```

## Entity Object

Placed entities have these key attributes:
```python
entity.name           # str: "burner-mining-drill"
entity.position       # Position
entity.direction      # Direction
entity.status         # EntityStatus
entity.id             # int: unique ID
entity.health         # float
entity.energy         # float
entity.fuel           # Inventory (for burner entities)
entity.prototype      # Prototype enum value
entity.warnings       # list[str]: current warning messages
entity.neighbours     # list: adjacent connected entities
entity.drop_position  # Position (for drills: where mined items go)
entity.resources      # list[Ingredient] (for drills: what ore is available)
entity.tile_dimensions # TileDimensions(tile_width, tile_height)

# Furnace-specific:
entity.furnace_source # Inventory (input items)
entity.furnace_result # Inventory (output items)

# Assembler-specific:
entity.assembling_machine_input  # Inventory
entity.assembling_machine_output # Inventory
```

## Key Patterns

### Bootstrap: Coal → Iron → Automation
```python
# 1. Get coal (needed for all burner entities)
move_to(nearest(Resource.Coal))
harvest_resource(nearest(Resource.Coal), quantity=50)

# 2. Get stone for furnaces
move_to(nearest(Resource.Stone))
harvest_resource(nearest(Resource.Stone), quantity=25)

# 3. Place drill on iron ore, furnace at drop position
move_to(nearest(Resource.IronOre))
drill = place_entity(Prototype.BurnerMiningDrill, position=nearest(Resource.IronOre), direction=Direction.DOWN)
insert_item(Prototype.Coal, drill, quantity=10)
furnace = place_entity(Prototype.StoneFurnace, position=Position(x=drill.drop_position.x, y=drill.drop_position.y + 1))
insert_item(Prototype.Coal, furnace, quantity=10)

# 4. Wait and collect
sleep(30)
extract_item(Prototype.IronPlate, furnace, quantity=20)
```

### Checking what's happening
```python
# Render the map
# use: mcp__factorio-fle__render(center_x=-100, center_y=25)

# Check all entities
for e in get_entities():
    print(f"{e.name} at {e.position} - {e.status}")

# Check inventory
for item, count in inspect_inventory().items():
    if count > 0:
        print(f"{item}: {count}")
```

### Important Notes
- **Fuel**: Burner drills and furnaces need coal/wood. Insert fuel with `insert_item(Prototype.Coal, entity)`.
- **Smelting**: Iron/copper plates cannot be hand-crafted. They must be smelted in a furnace.
- **Drill placement**: Burner mining drills are 2x2. They mine what's under them and drop at `drop_position`.
- **Furnace feeding**: Place furnace so it overlaps the drill's `drop_position` for auto-feeding.
- **Electric entities**: Need power poles connected to boiler+steam engine or solar+accumulator.
- **Assembling machines**: Need `set_entity_recipe()` after placing, plus input items.
- **Labs**: Insert science packs with `insert_item()`. Set research with `set_research()`.
- **Sleep**: Use `sleep(N)` to let machines work and advance the game clock.
- **Checkpoints**: Use `commit("name")` via MCP tool to save state. Restore with `restore("name")`.
- **Score**: Based on science pack production. Check with `score()`.
- **Resource patches may overlap**: When harvesting, the actual ore mined depends on what's at the exact tile, not just the patch name. Move to the center of a patch for reliability.

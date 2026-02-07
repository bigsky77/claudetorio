import asyncio
import json
import re
import shutil
from pathlib import Path

from mcrcon import MCRcon

from ..config import config


def get_rcon_connection(slot: int) -> MCRcon:
    """Get RCON connection for a slot."""
    port = config.BASE_RCON_PORT + slot
    return MCRcon(config.SERVER_HOST, config.RCON_PASSWORD, port=port)


async def get_slot_score(slot: int) -> dict:
    """
    Query FLE for current production statistics.
    Returns dict with score from FLE's production_score system.
    """
    return _sync_get_slot_score(slot)


def _sync_get_slot_score(slot: int) -> dict:
    """Synchronous RCON call to get score."""
    try:
        port = config.BASE_RCON_PORT + slot
        rcon = MCRcon(config.SERVER_HOST, config.RCON_PASSWORD, port=port)
        rcon.connect()
        try:
            response = rcon.command("/silent-command rcon.print(global.actions.score())")
        finally:
            rcon.disconnect()

        if not response:
            return {"score": 0, "items": {}}

        try:
            match = re.search(r'\["player"\]\s*=\s*(-?\d+)', response)
            if match:
                score = int(match.group(1))
                return {"score": score, "items": {}, "raw": response}

            data = json.loads(response)
            return {"score": data.get("player", 0), "items": data}
        except (json.JSONDecodeError, ValueError):
            print(f"Could not parse score response for slot {slot}: {response[:200]}")
            return {"score": 0, "items": {}, "raw": response}
    except Exception as e:
        print(f"RCON error for slot {slot}: {e}")
        return {"score": 0, "items": {}, "error": str(e)}


async def reset_slot(slot: int):
    """Reset a slot to a fresh game state."""
    try:
        with get_rcon_connection(slot) as rcon:
            rcon.command("/silent-command game.reset_game_state()")
    except Exception as e:
        print(f"Error resetting slot {slot}: {e}")
        raise


async def load_save_to_slot(slot: int, save_path: Path):
    """Load a save file into a specific slot."""
    try:
        fle_save_path = config.FLE_SAVES_DIR / f"slot_{slot}" / "save.zip"
        fle_save_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(save_path, fle_save_path)

        with get_rcon_connection(slot) as rcon:
            rcon.command(f"/silent-command game.server_save('slot_{slot}')")
    except Exception as e:
        print(f"Error loading save to slot {slot}: {e}")
        raise


async def save_slot_state(slot: int, save_path: Path):
    """Save current slot state to a file."""
    try:
        save_path.parent.mkdir(parents=True, exist_ok=True)

        with get_rcon_connection(slot) as rcon:
            save_name = f"claudetorio_save_{slot}"
            rcon.command(f"/silent-command game.server_save('{save_name}')")
            await asyncio.sleep(2)

        fle_save = config.FLE_SAVES_DIR / f"{save_name}.zip"
        if fle_save.exists():
            shutil.copy2(fle_save, save_path)
        else:
            print(f"Warning: Save file not found at {fle_save}")
    except Exception as e:
        print(f"Error saving slot {slot}: {e}")
        raise


def _sync_get_factory_data(slot: int, radius: int = 50) -> dict:
    """Get factory state data from FLE via RCON."""
    try:
        port = config.BASE_RCON_PORT + slot
        rcon = MCRcon(config.SERVER_HOST, config.RCON_PASSWORD, port=port)
        rcon.connect()
        try:
            response = rcon.command(f"/silent-command rcon.print(game.table_to_json(global.actions.render(1, true, {radius}, 'none')))")
        finally:
            rcon.disconnect()

        if not response or 'Error' in response:
            return {"error": response or "No data returned"}

        try:
            data = json.loads(response)
            entity_counts = {}
            if 'entities' in data:
                for entity in data['entities']:
                    name = entity.get('name', 'unknown').strip('"')
                    entity_counts[name] = entity_counts.get(name, 0) + 1

            return {
                "total_entities": len(data.get('entities', [])),
                "entity_counts": entity_counts,
                "has_water": len(data.get('water_runs', [])) > 0 if 'water_runs' in data else False,
            }
        except json.JSONDecodeError as e:
            return {"error": f"JSON parse error: {str(e)}"}
    except Exception as e:
        print(f"Factory data error for slot {slot}: {e}")
        return {"error": str(e)}


def _sync_get_detailed_score(slot: int) -> dict:
    """Get detailed score breakdown from FLE."""
    try:
        port = config.BASE_RCON_PORT + slot
        rcon = MCRcon(config.SERVER_HOST, config.RCON_PASSWORD, port=port)
        rcon.connect()
        try:
            score_response = rcon.command("/silent-command rcon.print(global.actions.score())")
        finally:
            rcon.disconnect()

        result = {"score": 0, "breakdown": {}}

        if score_response:
            match = re.search(r'\["player"\]\s*=\s*(-?\d+)', score_response)
            if match:
                result["score"] = int(match.group(1))
            result["raw"] = score_response

        return result
    except Exception as e:
        print(f"Detailed score error for slot {slot}: {e}")
        return {"score": 0, "error": str(e)}


def _sync_get_inventory(slot: int) -> dict:
    """Get player inventory from FLE."""
    try:
        port = config.BASE_RCON_PORT + slot
        rcon = MCRcon(config.SERVER_HOST, config.RCON_PASSWORD, port=port)
        rcon.connect()
        try:
            response = rcon.command("/silent-command rcon.print(game.table_to_json(game.players[1].get_main_inventory().get_contents()))")
        finally:
            rcon.disconnect()

        if not response or 'Error' in response:
            return {"items": {}, "total": 0}

        try:
            items = json.loads(response)
            return {
                "items": items,
                "total": sum(items.values()) if items else 0
            }
        except json.JSONDecodeError:
            return {"items": {}, "total": 0, "error": "Parse error"}
    except Exception as e:
        print(f"Inventory error for slot {slot}: {e}")
        return {"items": {}, "total": 0, "error": str(e)}


def _sync_get_research(slot: int) -> dict:
    """Get research progress from FLE."""
    try:
        port = config.BASE_RCON_PORT + slot
        rcon = MCRcon(config.SERVER_HOST, config.RCON_PASSWORD, port=port)
        rcon.connect()
        try:
            current_response = rcon.command("/silent-command if game.forces.player.current_research then rcon.print(game.forces.player.current_research.name) else rcon.print('none') end")
            progress_response = rcon.command("/silent-command rcon.print(game.forces.player.research_progress or 0)")
            researched_response = rcon.command("/silent-command local t={} for name,tech in pairs(game.forces.player.technologies) do if tech.researched then table.insert(t, name) end end rcon.print(game.table_to_json(t))")
        finally:
            rcon.disconnect()

        result = {
            "current_research": current_response.strip() if current_response and current_response.strip() != 'none' else None,
            "progress": 0,
            "researched": []
        }

        try:
            result["progress"] = float(progress_response.strip()) if progress_response else 0
        except ValueError:
            pass

        try:
            if researched_response:
                result["researched"] = json.loads(researched_response)
        except json.JSONDecodeError:
            pass

        return result
    except Exception as e:
        print(f"Research error for slot {slot}: {e}")
        return {"current_research": None, "progress": 0, "researched": [], "error": str(e)}


def _sync_get_production(slot: int) -> dict:
    """Get production statistics from FLE."""
    try:
        port = config.BASE_RCON_PORT + slot
        rcon = MCRcon(config.SERVER_HOST, config.RCON_PASSWORD, port=port)
        rcon.connect()
        try:
            produced_response = rcon.command("/silent-command rcon.print(game.table_to_json(game.forces.player.item_production_statistics.input_counts))")
            consumed_response = rcon.command("/silent-command rcon.print(game.table_to_json(game.forces.player.item_production_statistics.output_counts))")
        finally:
            rcon.disconnect()

        result = {"produced": {}, "consumed": {}, "net": {}}

        try:
            if produced_response and 'Error' not in produced_response:
                result["produced"] = json.loads(produced_response)
        except json.JSONDecodeError:
            pass

        try:
            if consumed_response and 'Error' not in consumed_response:
                result["consumed"] = json.loads(consumed_response)
        except json.JSONDecodeError:
            pass

        all_items = set(result["produced"].keys()) | set(result["consumed"].keys())
        for item in all_items:
            produced = result["produced"].get(item, 0)
            consumed = result["consumed"].get(item, 0)
            net = produced - consumed
            if net != 0:
                result["net"][item] = net

        return result
    except Exception as e:
        print(f"Production error for slot {slot}: {e}")
        return {"produced": {}, "consumed": {}, "net": {}, "error": str(e)}


def _sync_get_entities_list(slot: int, radius: int = 50) -> dict:
    """Get detailed entity list from FLE."""
    try:
        port = config.BASE_RCON_PORT + slot
        rcon = MCRcon(config.SERVER_HOST, config.RCON_PASSWORD, port=port)
        rcon.connect()
        try:
            response = rcon.command(f"/silent-command rcon.print(game.table_to_json(global.actions.render(1, true, {radius}, 'none')))")
        finally:
            rcon.disconnect()

        if not response or 'Error' in response:
            return {"entities": [], "total": 0}

        try:
            data = json.loads(response)
            entities = data.get('entities', [])

            clean_entities = []
            for e in entities[:200]:
                clean_entities.append({
                    "name": e.get('name', 'unknown').strip('"'),
                    "position": e.get('position', {}),
                    "direction": e.get('direction', 0),
                })

            return {
                "entities": clean_entities,
                "total": len(entities)
            }
        except json.JSONDecodeError:
            return {"entities": [], "total": 0, "error": "Parse error"}
    except Exception as e:
        print(f"Entities list error for slot {slot}: {e}")
        return {"entities": [], "total": 0, "error": str(e)}


import { ServerEventName, ServerEvent, ItemSlot } from '../../shared/interfaces';
import { ServerSocketEvent } from '../../shared/models';

export class UnequipItemEvent extends ServerSocketEvent implements ServerEvent {
  event = ServerEventName.ItemUnequip;
  description = 'Unequip an item.';
  args = 'itemSlot';

  async callback({ itemSlot } = { itemSlot: '' }) {
    const player = this.player;
    if(!player) return this.gameError('Your socket is not currently connected to a player.');

    const item = player.$inventory.itemInEquipmentSlot(<ItemSlot>itemSlot);
    if(!item) return this.gameError('You do not have an item in that slot.');

    const didSucceed = player.unequip(item, true);
    if(!didSucceed) return this.gameError('Your inventory is full.');

    this.game.updatePlayer(player);
    this.gameSuccess(`Unequipped ${item.name}!`);
  }
}

export class EquipItemEvent extends ServerSocketEvent implements ServerEvent {
  event = ServerEventName.ItemEquip;
  description = 'Equip an item.';
  args = 'itemId';

  async callback({ itemId } = { itemId: '' }) {
    const player = this.player;
    if(!player) return this.gameError('Your socket is not currently connected to a player.');

    const foundItem = player.$inventory.getItemFromInventory(itemId);
    if(!foundItem) return this.gameError('Could not find that item in your inventory.');

    // const item = player.$inventory.itemInEquipmentSlot(foundItem.type);
    // if(item) return this.gameError('You already have an item in that slot.');

    const didSucceed = player.equip(foundItem);
    if(!didSucceed) return this.gameError('Your inventory is full and cannot replace the item.');

    player.$inventory.removeItemFromInventory(foundItem);

    this.game.updatePlayer(player);
    this.gameSuccess(`Equipped ${foundItem.name}!`);
  }
}

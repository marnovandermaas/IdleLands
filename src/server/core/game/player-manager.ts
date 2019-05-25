import { Singleton, AutoWired, Inject } from 'typescript-ioc';
import { observe, generate, Observer, Operation } from 'fast-json-patch';

import { pullAllBy, pick, values } from 'lodash';

import { Player } from '../../../shared/models/entity';
import { ServerEventName, PlayerChannelOperation, Channel } from '../../../shared/interfaces';
import { SubscriptionManager } from './subscription-manager';

@Singleton
@AutoWired
export class PlayerManager {
  @Inject private subscriptionManager: SubscriptionManager;

  private players: { [key: string]: Player } = {};
  private playerList: Player[] = [];

  private playerWatches: { [key: string]: Observer<Player> } = {};
  private playerSockets: { [key: string]: any } = {};

  private currentPlayerMaps = {};
  private allPlayersSimple = {};
  private allPlayersInMaps = {};

  public playerDataHold = {};

  public get allPlayers(): Player[] {
    return this.playerList;
  }

  public get allSimplePlayers(): Player[] {
    return values(this.allPlayersSimple);
  }

  public async init() {
    this.subscribeToPlayerMessages();
    this.subscribeToPlayerListMods();
  }

  private subscribeToPlayerListMods() {
    this.subscriptionManager.subscribeToChannel(Channel.Players, ({ player, operation }) => {
      switch(operation) {
        case PlayerChannelOperation.Add: {
          const oldMap = this.currentPlayerMaps[player.name];
          if(oldMap && oldMap !== player.map) {
            pullAllBy(this.allPlayersInMaps[oldMap], [player], p => p.name === player.name);
          }

          this.allPlayersSimple[player.name] = player;
          this.currentPlayerMaps[player.name] = player.map;
          this.allPlayersInMaps[player.map] = this.allPlayersInMaps[player.map] || [];
          pullAllBy(this.allPlayersInMaps[player.map], [player], p => p.name === player.name);
          this.allPlayersInMaps[player.map].push(player);

          this.subscriptionManager.emitToClients(Channel.PlayerUpdates, { player, operation });
          break;
        }

        case PlayerChannelOperation.Update: {
          const oldMap = this.currentPlayerMaps[player.name];
          if(oldMap && oldMap !== player.map) {
            pullAllBy(this.allPlayersInMaps[oldMap], [player], p => p.name === player.name);
          }

          this.allPlayersSimple[player.name] = player;
          this.currentPlayerMaps[player.name] = player.map;
          this.allPlayersInMaps[player.map] = this.allPlayersInMaps[player.map] || [];
          pullAllBy(this.allPlayersInMaps[player.map], [player], p => p.name === player.name);
          this.allPlayersInMaps[player.map].push(player);
          break;
        }

        case PlayerChannelOperation.SpecificUpdate: {
          this.subscriptionManager.emitToClients(Channel.PlayerUpdates, { player, operation });
          break;
        }

        case PlayerChannelOperation.Remove: {
          delete this.allPlayersSimple[player.name];
          delete this.currentPlayerMaps[player.name];
          pullAllBy(this.allPlayersInMaps[player.map], [player], p => p.name === player.name);

          this.subscriptionManager.emitToClients(Channel.PlayerUpdates, { player, operation });
          break;
        }
      }
    });
  }

  private subscribeToPlayerMessages() {
    this.subscriptionManager.subscribeToChannel(Channel.EventMessage, ({ playerNames, data }) => {

      playerNames.forEach(playerName => {
        this.emitToPlayer(playerName, ServerEventName.AdventureLogAdd, { ...data });
      });
    });
  }

  private simplifyPlayer(player: Player) {
    return {
      name: player.name,
      title: player.title,
      level: player.level.__current,
      x: player.x,
      y: player.y,
      map: player.map,
      ascensionLevel: player.ascensionLevel,
      gender: player.gender,
      profession: player.profession
    };
  }

  public updatePlayer(player: Player, operation: PlayerChannelOperation = PlayerChannelOperation.Update) {
    this.subscriptionManager.emitToChannel(Channel.Players, { player: this.simplifyPlayer(player), operation });
  }

  private resetPlayerList() {
    this.playerList = Object.values(this.players);
  }

  public addPlayer(player: Player, socket): void {
    let sendUpdate = true;

    if(this.players[player.name]) {
      sendUpdate = false;
      this.removePlayer(player, false);
    }

    player.loggedIn = true;

    this.playerWatches[player.name] = observe(player);

    this.players[player.name] = player;
    this.playerSockets[player.name] = socket;
    this.playerDataHold[player.name] = {};
    this.resetPlayerList();

    if(sendUpdate) {
      this.updatePlayer(player, PlayerChannelOperation.Add);
    }
  }

  public removePlayer(player: Player, sendUpdates = true): void {
    if(this.playerWatches[player.name]) {
      this.playerWatches[player.name].unobserve();
    }

    delete this.players[player.name];
    delete this.playerWatches[player.name];
    delete this.playerDataHold[player.name];
    this.resetPlayerList();

    if(sendUpdates) {
      console.log('sending remove update', new Error().stack);
      this.updatePlayer(player, PlayerChannelOperation.Remove);
    }
  }

  public getPlayer(name: string): Player {
    return this.players[name];
  }

  public getPlayersInMap(map: string) {
    const players = this.allPlayersInMaps[map] || [];
    return players.map(x => pick(x, ['name', 'title', 'x', 'y', 'level', 'profession', 'gender']));
  }

  // TODO: return an array of player names and genders, and tell clients when to update (when join/leave)
  // lets try not showing all the other info this time
  // but we can totally show it when they chat!
  public getChatPlayers() {

  }

  public getPlayerPatch(name: string): Operation[] {
    return generate(this.playerWatches[name]);
  }

  public getPlayerSocket(name: string) {
    return this.playerSockets[name];
  }

  public emitToPlayer(playerName: string, event: ServerEventName, data: any): void {
    const socket = this.getPlayerSocket(playerName);
    if(!socket) return;

    socket.emit(event, data);
  }

}

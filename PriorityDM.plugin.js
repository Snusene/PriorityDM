/**
 * @name PriorityDM
 * @author Snues
 * @description Get notified for DMs bypassing Do Not Disturb. Right click a user to add them.
 * @version 1.0.0
 * @source https://github.com/Snusene/PriorityDM
 */

module.exports = class PriorityDM {
    constructor() {
        this.priorityUsers = new Set();
        this.lastPing = 0;
    }

    start() {
        this.loadSettings();
        this.UserStore = BdApi.Webpack.getStore("UserStore");
        this.PresenceStore = BdApi.Webpack.getStore("PresenceStore");
        this.ChannelStore = BdApi.Webpack.getStore("ChannelStore");
        this.NotificationModule = BdApi.Webpack.getByKeys("showNotification", "requestPermission");
        this.patchDispatcher();
        this.patchContextMenu();
    }

    stop() {
        BdApi.Patcher.unpatchAll("PriorityDM");
        if (this.unpatchContextMenu) this.unpatchContextMenu();
        this.saveSettings();
    }

    loadSettings() {
        const saved = BdApi.Data.load("PriorityDM", "users") || [];
        this.priorityUsers = new Set(saved);
    }

    saveSettings() {
        BdApi.Data.save("PriorityDM", "users", [...this.priorityUsers]);
    }

    patchContextMenu() {
        this.unpatchContextMenu = BdApi.ContextMenu.patch("user-context", (tree, props) => {
            const userId = props.user?.id;
            if (!userId || userId === this.UserStore?.getCurrentUser()?.id) return;

            const children = tree?.props?.children;
            if (!Array.isArray(children)) return;

            const isPriority = this.priorityUsers.has(userId);
            children.push(
                BdApi.ContextMenu.buildItem({ type: "separator" }),
                BdApi.ContextMenu.buildItem({
                    type: "toggle",
                    label: "Priority DMs",
                    checked: isPriority,
                    action: () => {
                        if (isPriority) this.priorityUsers.delete(userId);
                        else this.priorityUsers.add(userId);
                        this.saveSettings();
                    }
                })
            );
        });
    }

    patchDispatcher() {
        const Dispatcher = BdApi.Webpack.getByKeys("dispatch", "subscribe");
        if (!Dispatcher) return;

        BdApi.Patcher.after("PriorityDM", Dispatcher, "dispatch", (_, [event]) => {
            if (event?.type === "MESSAGE_CREATE") this.handleMessage(event);
        });
    }

    handleMessage(event) {
        const { message } = event;
        if (!message?.author || event.optimistic) return;

        const currentUser = this.UserStore?.getCurrentUser();
        if (!currentUser || message.author.id === currentUser.id) return;

        const channel = this.ChannelStore?.getChannel(message.channel_id);
        if (!channel || (channel.type !== 1 && channel.type !== 3)) return;

        if (this.PresenceStore?.getStatus(currentUser.id) !== "dnd") return;
        if (!this.priorityUsers.has(message.author.id)) return;

        this.notify(message, channel);
    }

    notify(message, channel) {
        const now = Date.now();
        if (now - this.lastPing < 1000) return;
        this.lastPing = now;

        if (!this.NotificationModule?.showNotification) return;

        const author = message.author;
        const avatar = author.avatar
            ? `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
            : `https://cdn.discordapp.com/embed/avatars/${(BigInt(author.id) >> 22n) % 6n}.png`;

        this.NotificationModule.showNotification(
            avatar,
            author.globalName,
            message.content,
            { message, channel },
            { overrideStreamerMode: true, sound: "message1", volume: 0.4 }
        );
    }
};

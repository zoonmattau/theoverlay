# Sets up the Discord server from the bot in .env.local: roles, permissions,
# channels, forums, community mode, a permanent invite. Builds on whatever is
# already there and renames nothing, so it is safe to run again.
#   python scripts/discord-setup.py          lists what is there
#   python scripts/discord-setup.py setup    builds it
import json, sys, time, urllib.request

env = dict(l.strip().split("=", 1) for l in open(".env.local", encoding="utf8") if "=" in l and not l.startswith("#"))
TOKEN, GID = env["DISCORD_BOT_TOKEN"], env["DISCORD_GUILD_ID"]
API = "https://discord.com/api/v10"


def call(method, path, body=None, reason=None):
    for _ in range(6):
        req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None)
        req.add_header("Authorization", "Bot " + TOKEN)
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "TheOverlaySetup/1.0")
        if reason:
            req.add_header("X-Audit-Log-Reason", reason)
        try:
            with urllib.request.urlopen(req) as r:
                time.sleep(0.6)
                txt = r.read().decode()
                return json.loads(txt) if txt else None
        except urllib.error.HTTPError as e:
            txt = e.read().decode()
            if e.code == 429:
                time.sleep(float(json.loads(txt).get("retry_after", 2)) + 0.5)
                continue
            raise SystemExit(f"{method} {path} -> {e.code} {txt}")
    raise SystemExit("rate limited too often")


def listing():
    g = call("GET", f"/guilds/{GID}")
    print("guild", g["name"], "features", g["features"], "rules", g.get("rules_channel_id"), "updates", g.get("public_updates_channel_id"))
    for c in sorted(call("GET", f"/guilds/{GID}/channels"), key=lambda c: (c.get("parent_id") or "", c["position"])):
        print(" channel", c["type"], c["id"], c["name"], "parent", c.get("parent_id"))
    for r in call("GET", f"/guilds/{GID}/roles"):
        print(" role", r["id"], r["name"], r["permissions"], "managed" if r.get("managed") else "")
    for i in call("GET", f"/guilds/{GID}/invites"):
        print(" invite", i["code"], "expires", i.get("expires_at"), "max_uses", i.get("max_uses"))


def setup():
    LIME, BLUE = 0xC8F53C, 0x3B82F6
    VIEW, SEND, THREADS_PUB, SEND_IN_THREADS, REACT, CONNECT, SPEAK, HISTORY = 1 << 10, 1 << 11, 1 << 35, 1 << 38, 1 << 6, 1 << 20, 1 << 21, 1 << 16
    ADMIN = 8
    everyone = GID
    roles = {r["name"]: r for r in call("GET", f"/guilds/{GID}/roles")}

    def role(name, color, perms, hoist):
        if name in roles:
            return roles[name]
        r = call("POST", f"/guilds/{GID}/roles", {"name": name, "color": color, "permissions": str(perms), "hoist": hoist, "mentionable": name != "Member"}, "Overlay setup")
        roles[name] = r
        print("role", name)
        return r

    admin = role("Admin", LIME, ADMIN, True)
    tipster = role("Tipster", BLUE, 0, True)
    member = role("Member", LIME, 0, False)

    chans = {c["name"]: c for c in call("GET", f"/guilds/{GID}/channels")}
    cats = {c["name"]: c for c in chans.values() if c["type"] == 4}

    def ov(role_id, allow=0, deny=0):
        return {"id": role_id, "type": 0, "allow": str(allow), "deny": str(deny)}

    TALK = VIEW | HISTORY | SEND | REACT | THREADS_PUB | SEND_IN_THREADS
    READ_ONLY = [ov(everyone, VIEW | HISTORY | REACT, SEND | THREADS_PUB | SEND_IN_THREADS), ov(admin["id"], SEND | THREADS_PUB | SEND_IN_THREADS)]
    OPEN = [ov(everyone, TALK)]
    ADMIN_ONLY = [ov(everyone, 0, VIEW), ov(admin["id"], VIEW | SEND | HISTORY)]
    MEMBERS_ONLY = [ov(everyone, 0, VIEW), ov(member["id"], TALK), ov(tipster["id"], TALK), ov(admin["id"], TALK)]
    TIPSTER_POSTS = [ov(everyone, VIEW | HISTORY | REACT | SEND_IN_THREADS, SEND | THREADS_PUB), ov(tipster["id"], SEND | THREADS_PUB), ov(admin["id"], SEND | THREADS_PUB)]
    TIPSTER_ONLY = [ov(everyone, 0, VIEW), ov(tipster["id"], TALK), ov(admin["id"], TALK)]
    # The calls themselves: members read, admin (and the bot) posts. Same rule as the site.
    MEMBERS_READ = [ov(everyone, 0, VIEW), ov(member["id"], VIEW | HISTORY | REACT), ov(tipster["id"], VIEW | HISTORY | REACT), ov(admin["id"], VIEW | HISTORY | SEND)]

    def category(name, overwrites):
        if name in cats:
            c = cats[name]
            call("PATCH", f"/channels/{c['id']}", {"permission_overwrites": overwrites})
            return c
        c = call("POST", f"/guilds/{GID}/channels", {"name": name, "type": 4, "permission_overwrites": overwrites}, "Overlay setup")
        cats[name] = c
        print("category", name)
        return c

    def channel(name, parent, overwrites, ctype=0, topic=None, extra=None):
        body = {"permission_overwrites": overwrites, **({"topic": topic} if topic else {}), **(extra or {})}
        if name in chans:
            c = chans[name]
            body["parent_id"] = parent["id"]
            if ctype in (0, 5) and c["type"] in (0, 5) and c["type"] != ctype:
                body["type"] = ctype
            call("PATCH", f"/channels/{c['id']}", body)
            return c
        c = call("POST", f"/guilds/{GID}/channels", {"name": name, "type": ctype, "parent_id": parent["id"], **body}, "Overlay setup")
        chans[name] = c
        print("channel", name)
        return c

    start = category("Start Here", READ_ONLY)
    calls = category("The Calls (Primes, Bets & Lays)", READ_ONLY)
    talk = category("Talk", OPEN)
    tipsters = category("Tipsters", TIPSTER_POSTS)
    members = category("Members", MEMBERS_ONLY)
    adminc = category("Admin", ADMIN_ONLY)
    voice = category("Voice", OPEN)

    # Community mode needs a rules channel and an updates channel first.
    welcome = channel("welcome", start, READ_ONLY, 0, "What The Overlay is and how the calls work.")
    rules = channel("rules", start, READ_ONLY, 0, "18+, be decent, no spam.")
    ann = channel("announcements", start, READ_ONLY, 0, "New features, the Saturday review, offers.")
    # Discord's own notices to moderators go to a plain text channel admins see.
    updates = channel("discord-updates", adminc, ADMIN_ONLY, 0, "Discord's notices for the server's admins.")
    g = call("GET", f"/guilds/{GID}")
    if "COMMUNITY" not in g["features"] or g.get("public_updates_channel_id") != updates["id"]:
        call("PATCH", f"/guilds/{GID}", {"verification_level": 1, "explicit_content_filter": 2, "default_message_notifications": 1, "rules_channel_id": rules["id"], "public_updates_channel_id": updates["id"], "system_channel_id": welcome["id"], "features": sorted(set(g["features"]) | {"COMMUNITY"})}, "Overlay setup")
        print("community mode on")
    channel("announcements", start, READ_ONLY, 5)

    for n, t, who in [
        ("overlay-of-the-day", "One a day, the biggest gap between our price and the market. Members.", MEMBERS_READ),
        ("prime-overlays", "The day's Prime Overlays. Members.", MEMBERS_READ),
        ("bets-and-lays", "Every call on the card. Members.", MEMBERS_READ),
        ("results", "How the day went, in units.", READ_ONLY),
        ("free-race", "The free race of the day, open to all.", READ_ONLY),
        ("saturday-review", "How Saturday ran against our numbers, open to all.", READ_ONLY),
        ("winners", "Every winning call as it lands, open to all.", READ_ONLY),
    ]:
        channel(n, calls, who, 0, t)

    channel("general", talk, OPEN, 0, "Anything racing.")
    channel("saturday-chat", talk, OPEN, 0, "Live on Saturday.")
    channel("midweek-chat", talk, OPEN, 0, "Wednesday and the rest of the week.")
    channel("feedback-for-admin", talk, OPEN, 0, "Bugs, ideas, things that read wrong.")
    # Forums: one thread per horse, one per Saturday review. An empty text
    # channel of the same name makes way; one with messages is left alone.
    for n, t in [("horses-to-follow", "One thread per horse. Say why."), ("the-review", "One thread per Saturday review. Sectionals, who ran above their mark, what we got wrong.")]:
        old = chans.get(n)
        if old and old["type"] == 0:
            if call("GET", f"/channels/{old['id']}/messages?limit=1"):
                print("kept", n, "as a text channel, it has messages")
                continue
            call("DELETE", f"/channels/{old['id']}", None, "Overlay setup, replaced by a forum")
            del chans[n]
        if n not in chans:
            channel(n, talk, OPEN, 15, t, {"default_sort_order": 1})

    channel("tipster-calls", tipsters, TIPSTER_POSTS, 0, "Our tipsters' own calls. Tipsters post, everyone reads.")
    channel("tipster-lounge", tipsters, TIPSTER_ONLY, 0, "Tipsters and admin only.")
    channel("members-lounge", members, MEMBERS_ONLY, 0, "Members only.")
    channel("early-look", members, MEMBERS_READ, 0, "Tomorrow's card the night before, members only.")
    for n in ("links", "matts-big-bets"):
        if n in chans:
            channel(n, adminc, ADMIN_ONLY)
    channel("Race Day", voice, [ov(everyone, VIEW | CONNECT | SPEAK)], 2)
    channel("The Review", voice, [ov(everyone, VIEW | CONNECT), ov(admin["id"], SPEAK), ov(tipster["id"], SPEAK)], 13, "The Saturday review, live.")

    order = ["Start Here", "The Calls (Primes, Bets & Lays)", "Talk", "Tipsters", "Members", "Voice", "Admin"]
    call("PATCH", f"/guilds/{GID}/channels", [{"id": cats[n]["id"], "position": i} for i, n in enumerate(order) if n in cats])

    # One permanent invite; a run after the first reuses it.
    forever = [i for i in call("GET", f"/guilds/{GID}/invites") if not i.get("expires_at") and not i.get("max_uses")]
    inv = forever[0] if forever else call("POST", f"/channels/{welcome['id']}/invites", {"max_age": 0, "max_uses": 0}, "Permanent invite")
    print("invite https://discord.gg/" + inv["code"])


if __name__ == "__main__":
    setup() if "setup" in sys.argv else listing()

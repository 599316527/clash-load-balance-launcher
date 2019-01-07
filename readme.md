残像拳 Zanzo Ken
============

[Afterimage Technique](http://dragonball.wikia.com/wiki/Afterimage_Technique) (残像拳 Zanzōken, lit. "Afterimage Fist") is an ability to move so swiftly that an image of the user is left behind.

## Clash Load Balance Launcher

1. Generate configs for clash workers and haproxy from clash/config.yml
2. Launch clash workers and haproxy

## Usage

```bash
node cli.js \
    --conf ~/.config/clash/config.yml \
    --port 9105 \
    --name "prefix" \
    --mode socks5 \
    --dry-run
```

HAProxy is listening on 8882.

## Deps

* Node 8+
* HAProxy
* Clash

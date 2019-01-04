#!/usr/bin/env node

const fse = require('fs-extra');
const yaml = require('js-yaml');
const program = require('commander');
const os = require('os');
const path = require('path');
const etpl = require('etpl');
const {exec} = require('child_process');
const {promisify} = require('util');

function parsePort(val) {
    return parseInt(val, 10)
}

function parseConf(val) {
    if (!val) {
        throw new Error('Conf is required')
    }
    console.log(`Clash conf: ${val}`)
    return yaml.safeLoad(fse.readFileSync(val, 'utf8'))
}

const tmpDir = path.join(os.tmpdir(), 'clash-load-balance-launcher')
console.log(`Tmp dir: ${tmpDir}`)

async function main() {

    program
        .option('-c, --conf <conf>', 'Clash config file', parseConf)
        .option('-p, --port <port>', 'Port from which is for clash servers', parsePort)
        .option('-n, --name [name]', 'Proxy name prefix to match in config file')
        .option('-m, --mode [mode]', 'Listen mode: socks5 | http', 'socks5')
        .option('--dry-run', 'Dry run')
        .parse(process.argv);

    let {
        conf,
        port: portStartsFrom,
        name: proxyNamePrefix,
        mode,
        dryRun
    } = program
    console.log({
        portStartsFrom,
        proxyNamePrefix,
        mode,
        dryRun
    })

    conf['external-controller'] = ''
    conf['redir-port'] = 0
    conf['socks-port'] = 0
    conf['port'] = 0
    conf['allow-lan'] = false

    let portConfKey
    if (mode === 'socks5') {
        portConfKey = 'socks-port'
    } else if (mode === 'http') {
        portConfKey = 'port'
    }

    let proxies = conf.Proxy.filter(function ({
        name
    }) {
        return name.startsWith(proxyNamePrefix)
    })
    conf.Proxy = proxies

    let groupName = 'defaults'
    let groups = proxies.map(function ({
        name
    }) {
        return {
            name: groupName,
            type: 'fallback',
            url: 'http://www.gstatic.com/generate_204',
            interval: 300,
            proxies: [name]
        }
    })
    conf['Proxy Group'] = []

    conf.Rule = conf.Rule.map(function (rule) {
        let parts = rule.split(',')
        if (!['DIRECT', 'REJECT'].includes(parts[parts.length - 1].toUpperCase())) {
            parts[parts.length - 1] = groupName
        }
        return parts.join(',')
    })

    // await fse.remove(tmpDir)
    await fse.ensureDir(tmpDir)
    let clashConfDirs = await Promise.all(groups.map(async function (group, i) {
        conf['Proxy Group'] = [group]
        conf[portConfKey] = portStartsFrom + i
        let yamlContent = yaml.safeDump(conf)
        let confDir = path.join(tmpDir, `clash_${i}`)
        await fse.ensureDir(confDir)
        await fse.writeFile(path.join(confDir, 'config.yml'), yamlContent)
        return confDir
    }))

    let haproxyConfRender = etpl.compile(await fse.readFile(path.join(__dirname, 'tpl/haproxy.cfg.etpl'), 'utf8'))
    let haproxyConfCotent = haproxyConfRender({
        mode: {socks5: 'tcp', http: 'http'}[mode],
        ports: groups.map((_, index) => portStartsFrom + index)
    })
    let haproxyConfPath = path.join(tmpDir, 'haproxy.cfg')
    await fse.writeFile(haproxyConfPath, haproxyConfCotent)

    let pidFile = path.join(tmpDir, 'pids.txt')
    let launchShellContent = ['#!/usr/bin/env bash']
        .concat(`cat ${pidFile} | xargs kill > /dev/null 2>&1`)
        .concat(`rm ${pidFile} > /dev/null 2>&1`)
        .concat(clashConfDirs.map(dir => `clash -d "${dir}" > ${path.join(dir, 'output.log')} 2>&1 &
echo $! >> ${pidFile}`))
        .concat(`haproxy -f "${haproxyConfPath}"
echo $! >> ${pidFile}`).join('\n')
    let launchShellPath = path.join(tmpDir, 'launch.sh')
    await fse.writeFile(launchShellPath, launchShellContent)

    if (!dryRun) {
        try {
            let output = await promisify(exec)(`bash "${launchShellPath}"`, {
                cwd: tmpDir,
                env: process.env
            })
            console.log(output)
        }
        catch (err) {
            console.log('Launch error: ', err)
        }
        console.log('Launched')
    }
    else {
        console.log('DONE')
    }
}

main()

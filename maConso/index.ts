import {linky as linkySecrets, gazpar as grdfSecrets} from './secrets/secrets.json'
import {InfluxDB, Point} from '@influxdata/influxdb-client'
import {Session as LinkySession} from 'linky'
import {ConsommationType, GRDF} from 'grdf-api'
import {CronJob} from 'cron'
import {writeFileSync} from 'fs'

const {
    INFLUXDB_TOKEN,
    INFLUXDB_URL,
    INFLUXDB_ORG,
    INFLUXDB_BUCKET,
    FIRST_RUN_AGE
} = process.env

type LinkySecret = { accessToken: string, refreshToken: string, PRM: string, isLoadCurve: boolean }
type GRDFSecret = { username: string, password: string, PCE: string }

const dateToString = (date: Date = new Date()) => date.toISOString().split('T')[0]

async function getLinkyPoints({accessToken, refreshToken, PRM, isLoadCurve}: LinkySecret, start: string) {
    const session = new LinkySession({
        accessToken,
        refreshToken,
        usagePointId: PRM,
        onTokenRefresh: (newAT, newRT) => {
            const newLinkySecrets = linkySecrets.filter(s => s.PRM !== PRM)
            if (newAT !== '' && newRT !== '') newLinkySecrets.push({accessToken: newAT, refreshToken: newRT, PRM, isLoadCurve})
            writeFileSync('./secrets/secrets.json', JSON.stringify({gazpar: grdfSecrets, linky: newLinkySecrets}))
        }
    })

    const end = dateToString()
    const points = [
        ...(await session.getDailyConsumption(start, end)).data.map(day =>
            new Point('ENEDIS__ENERGIE_SOUTIRAGE')
                .floatField('kWh', day.value / 1e3)
                .timestamp(new Date(day.date))
                .tag('PRM', PRM)
        ),
        ...(await session.getMaxPower(start, end)).data.map(day =>
            new Point('ENEDIS__PMAX_SOUTIRAGE')
                .floatField('kVA', day.value / 1e3)
                .timestamp(new Date(day.date))
                .tag('PRM', PRM)
        )
    ]
    if (isLoadCurve) {
        const period = 7 * 24 * 60 * 60e3
        for (let startCDCTime = new Date(start).getTime(); startCDCTime < new Date(end).getTime(); startCDCTime += period) {
            const startCDC = dateToString(new Date(startCDCTime))
            const endCDC = new Date(startCDCTime).getTime() + period > new Date(end).getTime() ? end : dateToString(new Date(new Date(startCDCTime).getTime() + period))
            console.log(`LOG(${PRM}): CDC PERIOD: ${startCDC} -> ${endCDC}`)
            try {
                points.push(...(await session.getLoadCurve(startCDC, endCDC)).data.map(step =>
                    new Point('ENEDIS__CDC_SOUTIRAGE')
                        .floatField('kW', step.value / 1e3)
                        .timestamp(new Date(step.date))
                        .tag('PRM', PRM)
                ))
            } catch (e) {
                console.log(`ERREUR(${PRM}): Impossible de récupérer la courbe de charge pour la période ${startCDC} -> ${endCDC}.`)
            }
        }

    }
    return points
}

async function getGRDFPoints({username, password, PCE}: GRDFSecret, start: string) {
    const user = new GRDF(await GRDF.login(username, password))
    return (await user.getPCEConsumption(ConsommationType.informatives, [PCE], start, dateToString()))[PCE].releves.filter(r => r.energieConsomme !== null).map(r =>
        new Point('GRDF__CONSOMMATION')
            .floatField('kWh', r.energieConsomme)
            .floatField('m3', Math.round(r.energieConsomme / r.coeffConversion * 100) / 100)
            .timestamp(new Date(r.journeeGaziere))
            .tag('PCE', PCE))
}

async function fetchData(firstRun: boolean = false) {
    const writeApi = new InfluxDB({
        url: INFLUXDB_URL,
        token: INFLUXDB_TOKEN
    }).getWriteApi(INFLUXDB_ORG, INFLUXDB_BUCKET)

    const start = firstRun ? dateToString(new Date(Date.now() - parseInt(FIRST_RUN_AGE ?? '63072000') * 1e3)) : dateToString(new Date(Date.now() - 7 * 24 * 60 * 60e3))
    for (const linkySecret of linkySecrets) {
        try {
            writeApi.writePoints(await getLinkyPoints(linkySecret, start))
            console.log(`SUCCES(${linkySecret.PRM}): Relevés d'électricité obtenus.`)
        } catch (e) {
            console.log(`ERREUR(${linkySecret.PRM}): Impossible d'obtenir les données d'électricité.`)
        }
    }
    for (const grdfSecret of grdfSecrets) {
        try {
            writeApi.writePoints(await getGRDFPoints(grdfSecret, start))
            console.log(`SUCCES(${grdfSecret.PCE}): Relevés de gaz obtenus.`)

        } catch (e) {
            console.log(`ERREUR(${grdfSecret.PCE}): Impossible d'obtenir les données de gaz.`)
        }
    }
    await writeApi.close()
    console.log("SUCCES: Base de données mise à jour.")
}

fetchData(true)

new CronJob('0 8 * * *', fetchData).start()

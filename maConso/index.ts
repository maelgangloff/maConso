import { InfluxDB, Point } from '@influxdata/influxdb-client'
import { Session as LinkySession } from 'linky'
import { ConsommationType, GRDF } from 'grdf-api'

const {
  DOCKER_INFLUXDB_URL,
  DOCKER_INFLUXDB_INIT_ADMIN_TOKEN,
  DOCKER_INFLUXDB_INIT_ORG,
  DOCKER_INFLUXDB_INIT_BUCKET,
  FIRST_RUN_AGE,
  LINKY_TOKEN,
  LINKY_PRM,
  LINKY_LOAD_CURVE,
  LINKY_PRODUCTION_CURVE,
  LINKY_PRODUCTION,
  GAZPAR_USERNAME,
  GAZPAR_PASSWORD,
  GAZPAR_PCE
} = process.env

interface LinkySecret { token: string, PRM: string, isProduction: boolean, isLoadCurve: boolean, isProductionLoadCurve: boolean }
interface GRDFSecret { username: string, password: string, PCE: string }

const dateToString = (date: Date = new Date()): string => date.toISOString().split('T')[0]

/**
 * Récupérer la liste des points de mesure d'électricité à renvoyer vers InfluxDB.
 * @param {LinkySecret} linkySecret Authentification de l'utilisateur ENEDIS
 * @param {string} start Date de début de la relève au format YYYY-MM-DD
 * @returns {Promise<Point>} La liste des points de mesure
 */
async function getLinkyPoints ({ token, PRM, isProduction, isLoadCurve, isProductionLoadCurve }: LinkySecret, start: string): Promise<Point[]> {
  const session = new LinkySession(token, PRM)

  const end = dateToString()

  const points = [
    ...(await session.getDailyConsumption(start, end)).interval_reading.map(day =>
      new Point('ENEDIS__ENERGIE_SOUTIRAGE')
        .floatField('kWh', parseInt(day.value) / 1e3)
        .timestamp(new Date(day.date))
        .tag('PRM', PRM)
    ),
    ...(await session.getMaxPower(start, end)).interval_reading.map(day =>
      new Point('ENEDIS__PMAX_SOUTIRAGE')
        .floatField('kVA', parseInt(day.value) / 1e3)
        .timestamp(new Date(day.date))
        .tag('PRM', PRM)
    )
  ]

  if (isProduction) {
    points.push(...(await session.getDailyProduction(start, end)).interval_reading.map(step =>
      new Point('ENEDIS__ENERGIE_PRODUCTION')
        .floatField('kWh', parseInt(step.value) / 1e3)
        .timestamp(new Date(step.date))
        .tag('PRM', PRM)
    ))
  }

  const period = 7 * 24 * 60 * 60e3
  for (let startCDCTime = new Date(start).getTime(); startCDCTime < new Date(end).getTime(); startCDCTime += period) {
    const startCDC = dateToString(new Date(startCDCTime))
    const endCDC = new Date(startCDCTime).getTime() + period > new Date(end).getTime() ? end : dateToString(new Date(new Date(startCDCTime).getTime() + period))

    if (isLoadCurve) {
      console.log(`LOG(${PRM}): CDC PERIOD: ${startCDC} -> ${endCDC}`)
      points.push(...(await session.getLoadCurve(startCDC, endCDC)).interval_reading.map(step =>
        new Point('ENEDIS__CDC_SOUTIRAGE')
          .floatField('kW', parseInt(step.value) / 1e3)
          .timestamp(new Date(step.date))
          .tag('PRM', PRM)
      ))
    }
    if (isProductionLoadCurve) {
      console.log(`LOG(${PRM}): CDC PRODUCTION PERIOD: ${startCDC} -> ${endCDC}`)
      points.push(...(await session.getProductionLoadCurve(startCDC, endCDC)).interval_reading.map(step =>
        new Point('ENEDIS__CDC_PRODUCTION')
          .floatField('kW', parseInt(step.value) / 1e3)
          .timestamp(new Date(step.date))
          .tag('PRM', PRM)
      ))
    }
  }

  return points
}

/**
 * Récupérer la liste des points de mesure de gaz à renvoyer vers InfluxDB.
 * @param {GRDFSecret} grdfSecret Authentification de l'utilisateur GRDF
 * @param start Date de début de la relève au format YYYY-MM-DD
 * @returns {Promise<Point>} La liste des points de mesure
 */
async function getGRDFPoints ({ username, password, PCE }: GRDFSecret, start: string): Promise<Point[]> {
  const user = new GRDF(await GRDF.login(username, password))
  return (await user.getPCEConsumption(ConsommationType.informatives, [PCE], start, dateToString()))[PCE].releves.filter(r => r.energieConsomme !== null).map(r => {
    const point = new Point('GRDF__CONSOMMATION')
      .floatField('kWh', r.energieConsomme)
      .floatField('m3', r.volumeBrutConsomme)
      .floatField('kWh/m3', r.coeffConversion)
      .timestamp(new Date(r.journeeGaziere as string))
      .tag('PCE', PCE)

    return point
  }
  )
}

/**
 * Récupérer les données de consommation (et de production) de ENEDIS et GRDF.
 * Les points de mesure sont envoyées à une base de données InfluxDB.
 * @param {boolean} firstRun Le script itère les requêtes jusqu'à arriver à la date FIRST_RUN_AGE
 */
async function fetchData (firstRun: boolean = false): Promise<void> {
  if
  (DOCKER_INFLUXDB_INIT_ADMIN_TOKEN === undefined ||
    DOCKER_INFLUXDB_URL === undefined ||
    DOCKER_INFLUXDB_INIT_ORG === undefined ||
    DOCKER_INFLUXDB_INIT_BUCKET === undefined ||
    FIRST_RUN_AGE === undefined
  ) throw new Error("Les variables d'environnement ne sont pas correctement définies.")

  const linkySecrets: LinkySecret[] = (
    LINKY_PRM !== undefined && LINKY_TOKEN !== undefined
  )
    ? LINKY_PRM.split(',').map((prm: string): LinkySecret => ({
      PRM: prm,
      token: LINKY_TOKEN,
      isLoadCurve: LINKY_LOAD_CURVE === 'true',
      isProduction: LINKY_PRODUCTION === 'true',
      isProductionLoadCurve: LINKY_PRODUCTION_CURVE === 'true'
    }))
    : []

  const grdfSecrets: GRDFSecret[] = (GAZPAR_PCE !== undefined && GAZPAR_USERNAME !== undefined && GAZPAR_PASSWORD !== undefined)
    ? GAZPAR_PCE.split(',').map((pce: string): GRDFSecret => ({ PCE: pce, username: GAZPAR_USERNAME, password: GAZPAR_PASSWORD }))
    : []

  if (linkySecrets.length === 0 && grdfSecrets.length === 0) throw new Error("Impossible de trouver les informations d'authentification.")

  const writeApi = new InfluxDB({
    url: DOCKER_INFLUXDB_URL,
    token: DOCKER_INFLUXDB_INIT_ADMIN_TOKEN
  }).getWriteApi(DOCKER_INFLUXDB_INIT_ORG, DOCKER_INFLUXDB_INIT_BUCKET)

  const start = firstRun ? dateToString(new Date(Date.now() - parseInt(FIRST_RUN_AGE ?? '63072000') * 1e3)) : dateToString(new Date(Date.now() - 7 * 24 * 60 * 60e3))
  for (const linkySecret of linkySecrets) {
    writeApi.writePoints(await getLinkyPoints(linkySecret, start))
    console.log(`SUCCES(${linkySecret.PRM}): Relevés d'électricité récupérés du ${start} à aujourd'hui.`)
  }
  for (const grdfSecret of grdfSecrets) {
    writeApi.writePoints(await getGRDFPoints(grdfSecret, start))
    console.log(`SUCCES(${grdfSecret.PCE}): Relevés de gaz récupérés du ${start} à aujourd'hui.`)
  }
  await writeApi.close()
  console.log('SUCCES: Base de données mise à jour.')
}

fetchData(true).catch(e => { throw e }) // Récupérer les données depuis la date FIRST_RUN_AGE

setInterval(() => {
  fetchData().catch(e => { throw e }) // Récupérer les données des 7 derniers jours
}, 24 * 60 * 60 * 1e3)

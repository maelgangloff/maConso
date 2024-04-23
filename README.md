# Suivi de la consommation énergétique d'une habitation

![Tableau de bord par défaut](docs/defaultDashboard.png)

Ce projet permet de visualiser la consommation énergétique (électricité et gaz) d'une habitation.

## Installation

1. Installer Docker
2. [Obtenir un jeton d'accès via Conso API](https://conso.boris.sh). Ce service est rendu possible via le projet [@bokub/linky](https://github.com/bokub/linky)
3. Copier le fichier `.maConso.env.dist` vers `.maConso.env`
```shell
cp .maConso.env.dist .maConso.env
```
4. Editer `.maConso.env` avec vos identifiants ENEDIS et/ou GRDF
```shell
nano .maConso.env
```
5. Lancer les conteneurs
```shell
docker compose up --build -d
```
6. Se rendre sur l'interface Grafana http://localhost:3000/, les identifiants par défauts sont admin/admin. Il vous sera normalement demandé de définir un nouveau mot de passe. 

Un tableau de bord préconfiguré est déjà disponible, mais vous pouvez en créer un autre à partir des données collectées dans la base de données.


## Les requêtes InfluxDB

Les enregistrements incluent un tag contenant le numéro du compteur (PRM pour Linky et PCE pour Gazpar), ainsi si vous possédez un accès à plusieurs compteurs, vous pouvez filtrer les données pour ne sélectionner qu'un compteur:

```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "ENEDIS__ENERGIE_SOUTIRAGE")
  |> filter(fn: (r) => r["PRM"] == "06587593521409")
  |> filter(fn: (r) => r["_field"] == "kWh")
```

### Électricité (Linky)

#### Consommation électricité (kWh)

```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "ENEDIS__ENERGIE_SOUTIRAGE")
  |> filter(fn: (r) => r["_field"] == "kWh")
```

#### Puissance apparente maximale (kVA)

```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "ENEDIS__PMAX_SOUTIRAGE")
  |> filter(fn: (r) => r["_field"] == "kVA")
```

#### Courbe de charge électricité (kW)

```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "ENEDIS__CDC_SOUTIRAGE")
  |> filter(fn: (r) => r["_field"] == "kW")
```

#### Production d'électricité (kWh)
```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "ENEDIS__ENERGIE_PRODUCTION")
  |> filter(fn: (r) => r["_field"] == "kWh")
```

#### Courbe de production (kW)
```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "ENEDIS__CDC_PRODUCTION")
  |> filter(fn: (r) => r["_field"] == "kW")
```

### Gaz (Gazpar)

#### Consommation gaz (kWh)

```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "GRDF__CONSOMMATION")
  |> filter(fn: (r) => r["_field"] == "kWh")
```

#### Consommation gaz (m3)

```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "GRDF__CONSOMMATION")
  |> filter(fn: (r) => r["_field"] == "m3")
```

# Tableau de bord consommation

## Installation

1. Installer Docker
1. [Obtenir des jetons d'accès ENEDIS](https://conso.vercel.app/)
1. Copier le fichier `maConso/secrets/secrets.json` vers `secrets/secrets/json`
1. Editer `secrets/secrets.json` avec vos identifiants ENEDIS et/ou GRDF
1. `docker compose up --build -d`
1. Se rendre sur l'interface Grafana http://localhost:3000/, les identifiants par défauts sont admin/admin
1. Ajouter une source de données InfluxDB avec les paramètres suivants:
    - Query Language: **Flux**
    - URL: **http://database:8086**
    - Organization: **maconso**
    - Token: *Le token contenu dans `docker-compose.yaml`*
    - Default Bucket: **maconso**
1. Créer votre tableau de bord sur Grafana

## Exemples de requêtes

### Consommation électricité (kWh)
```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "ENEDIS__ENERGIE_SOUTIRAGE")
  |> filter(fn: (r) => r["_field"] == "kWh")
```

### Puissance apparente maximale (kVA)
```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "ENEDIS__PMAX_SOUTIRAGE")
  |> filter(fn: (r) => r["_field"] == "VA")
```

### Courbe de charge électricité
```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "ENEDIS__CDC_SOUTIRAGE")
  |> filter(fn: (r) => r["_field"] == "kWh")
```

### Consommation gaz (kWh)
```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "GRDF__CONSOMMATION")
  |> filter(fn: (r) => r["_field"] == "kWh")
```

### Consommation gaz (m3)
```SQL
from(bucket: "maconso")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) => r["_measurement"] == "GRDF__CONSOMMATION")
  |> filter(fn: (r) => r["_field"] == "m3")
```

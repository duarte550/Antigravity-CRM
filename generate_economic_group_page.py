import re

with open('components/MasterGroupDetailsPage.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Substitutions
content = content.replace('MasterGroup', 'EconomicGroup')
content = content.replace('masterGroup', 'economicGroup')
content = content.replace('Master Group', 'Grupo Econômico')
content = content.replace('master-group', 'economic-group')
content = content.replace('master grupo', 'grupo econômico')
content = content.replace('Master grupo', 'Grupo econômico')

with open('components/EconomicGroupDetailsPage.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Created components/EconomicGroupDetailsPage.tsx')

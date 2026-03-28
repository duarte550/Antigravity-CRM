To Dos:

* Antes de gerar qualquer funcionalidade nova gerar testes automatizados para todos os endpoints da api  
* Definir processo de CI  
* Seção de Originação:  
  * PorFundoTab:  
    * Ajustar para sempre mostrar o fundo com mais caixa na primeira pagina a abrir e salvar no cache qual era o ultimo fundo que o usuario estava visualizando  
  * Banco de dados: adicionar histórico de operações high yield  
  * Em todas as abas de originação, adicionar filtro de operações high yield e high grade  
* Tela Resumo Geral: Arrumar página de resumo inicial, ela nao esta sendo muito útil da forma atual. Tela inicial, deveria ser um resumo do que esta acontecendo nas outras paginas, contendo: gráfico de bolinhas de watchlist apenas com as operações que receberam alteração, alterações recentes de todos os usuarios, tarefas marcadas como importantes ou urgentes da semana, novos riscos levantados, novas operações adicionadas. Remover carteira completa dessa página  
* Nova página com carteira completa, parecida com a que tinha na tela de resumo. Porém aqui o sistema deve apresentar um quadro de resumo com volume por analista, número de operações, número de revisões calculado por ano (pegar a periodicidade das operaçoes), número de casos em watchlist, revisões em atraso e revisões para o mes  
* Hub do Analista  
  * Na tab de hub do analista a criação de um pipeline de tarefas que o analista pretende executar e conseguir ir colocando etapas concluiveis ao longo do tempo que ele pode ir marcando. Ele pode marcar a operação como concluída por lá e o sistema joga a proxima tarefa do pipeline  
  * adicionar resumo da semana concluida e da semana a vir na pagina de hub do analista  
* Nova Página: Comitês  
  * Conceito geral: Essa página visa organizar a pauta de comitês de investimento e de monitoramento de uma área selecionada. Ela deve conter uma linha do tempo de todos os comitês realizados, mostrando os últimos que foram concluídos e os próximos com pauta aberta. Abaixo de cada comitê completado, devem conter os próximos passos e status das tarefas que foram geradas naquele comitê e o item desse comitê deve brilhar em verde mostrando sua conclusão. Todos os comitês passados ou ativos (que ainda nao aconteceram) devem ser possiveis de serem clicados para acessar a pagina do comite especifico. Só devem ser mostrados os comitês que já passaram e o próximo comitê ativo, o que será o proximo da regra. Deve haver um botão de adicionar itens das pautas de comitê nessa pagina também, onde o usuário deve selecionar o comite e a data do comitê que ele quer reservar (deve ser possível agendar pautas apenas em comitês ativos (o proximo comite da regra que deve acontecer), ou no próximo comite depois do comite ativo), e o restante dos campos a serem preenchidos devem ser iguais aos que ele poderia criar na página do comitê especifico  
  * Os comitês devem ser criados com uma regra de task recorrente com periodicidade semanal, DEVE SER DEFINIDO QUAL ÁREA (deve haver apenas 1 comitê de cada tipo, um de monitoramento e um de investimentos, por área\!\!), data de criação, data da semana em que acontece o comitê e horário.  
  * Devemos ter filtros nessa pagina para selecionar os comites de áreas especificas.  
  * Para cada comitê de cada área, deve conter um resumo dos últimos 4 comitês que aconteceram dessa área  
  * Comitê específico:  
    * A pauta do comitê de investimentos é sempre dividida nas seções Default: RI, Risco, Assuntos Gerais, Casos para aprovação, Casos de revisão e IA/Inovação. Podem ser adicionadas novas seções, mas isso deve ser uma opção de menor destaque.   
    * A pauta do comitê de monitoramentos é sempre dividida nas seções Default: Assuntos Gerais, Watchlist, Assunto recorrente da semana e Inovação. Podem ser adicionadas novas seções, mas isso deve ser uma opção de menor destaque.   
    * Os usuários devem ser capazes de adicionar novos itens para o comitê. Cada item deve ser alocado em uma seção específica e deve conter, título, descrição (opcional), usuário que criou (idealmente o nome do usuario puxado do microsoft entra id) e se é um vídeo ou é um item que será apresentado presencialmente, caso seja vídeo um link para o vídeo. Além disso, para os casos para aprovação e casos de revisão, eles devem conter uma tag de aprovação. No campo de criação, devemos poder indicar uma prioridade “Urgente” ou “Alta”, de tal forma que esse item seja mostrado antes na pauta e tenha uma tag indicando sua prioridade  
    * Conclusões de tarefas de revisão de Crédito (politica ou gerencial) devem criar um item na pauta do próximo comitê de investimentos daquela área específica  
    * Cada item da pauta, deve ter um botão para ser aberto, em que mostrará todas as informações do item e uma funcionalidade que os usuários possam comentar esse item e mostrar o feed de comentários desse item especifico. Esses comentários devem mostrar o nome do usuario, a data de publicação e o comentário, Além de um botão de like com contador  
    * Cada item da pauta contendo um vídeo, deve ter um check-box para o usuário marcar que ele assistiu o vídeo e, para os casos de aprovação, deve sinalizar quais aprovações estão pendentes (a ser implementado)  
    * Cada comitê deve registrar por usuário quais vídeos foram assistidos ou não e guardar esse histórico numa base. Na página em si, devemos ter um lugar proximo a cada item da pauta que diga quem assistiu o vídeo (usuarios que marcaram check no item da pauta que continha o video)  
    * Para os casos com vídeo, o usuário deve ser capaz de solicitar detalhamento/discussão no próximo comitê.  
    * Nessa página, devemos ser capazes de ir preenchendo durante o comitê é realizado uma seção de próximos passos ou de tarefas. A ideia aqui seria que cada item da pauta pode gerar um campo de próximos passos e tarefas específicas para alguém e devemos ser capazes de criar essa tarefa pontual relacionada a esse item para a pessoa indicada, pode ser outra pessoa, mas normalmente a pessoa que criou o item na pauta  
    * Devemos ter um botão que gere um relatório de resumo da pauta. Esse relatório deve ser algo conciso que mostre todos os itens da pauta, sua descrição, criador do item, quantidade de comentários, sinalização das aprovações caso ja tenha (status possíveis: Aprovado, Reprovado, Discussão em Comitê) e quem falta aprovar. E deve ser pensado num formato que seja possível de ser enviado por e-mail html no outlook no dia anterior ao comitê.  
    * O comitê deve ter um botão de completar após o comitê que gerará uma pauta com todos os itens da ata, seus comentários, tarefas geradas e próximos passos  
    * Os itens de casos para aprovação devem estar sempre linkados com uma operação em originação ou com uma operação ativa. Devem conter um tag com o nome da operação e com um link para a página dessa operação. Na página do comitê, deve ser possível criar novas operações em estruturação, caso elas não existam ainda (usar mesmo modal de formulario que já existe, mas ele deve estar acessivel aqui).  
    * Para os casos de revisão, eles sempre tem que indicar qual a operação ativa a que eles se referem, devem conter um tag com o nome da operação e com um link para a página dessa operação e um tag com o farol de watchlist atual dessa operação. Ordenar sempre por importância do watchlist seguindo a ordem: Vermelho \> Rosa \> Amarelo e Verde. No item da pauta, deve ter um indicativo do sentimento que o analista marcou na conclusão da revisão. Os casos de revisão também quando abertos, devem mostrar todos os campos da tarefa de conclusão de revisão.  
    * Não quero que sejam abertas novas telas para ver mais detalhes de cada item da pauta, isso deve ser um botão que expanda e volte (sanfona)  
    * Nos itens com vídeo, ele deve sinalizar no item da pauta resumido a duração do vídeo  
  * Página de vídeo:  
    * Precisamos fazer uma tela complementar que se abra para os itens de vídeo, caso o usuario queira assistir o vídeo. Essa página deve se basear um pouco numa página de vídeo do youtube. Essa página deve conter o vídeo, num tamanho adequado (pensar no tamanho do vídeo padrão do youtube), **que virá sempre do microsoft stream**. Ao lado do vídeo, devemos ter o resumo/descrição do vídeo (input do usuário na criação do item), principais riscos (puxado da operação, caso eles existam) e, caso existam, os ratings definidos para a operação, watchlist e sentimento. Além disso, em baixo do vídeo, devemos ter um espaço para votar (caso seja aprovação: Aprovado, Reprovado e Discutir em Comitê e caso seja um vídeo qualquer um botão para marcar que foi assistido por aquele usuario especifico, salvar usuarios que votaram, tipo de voto e data \-\> o usuário pode mudar seu voto, mas temos que registrar no sistema a mudança e a data da mudança) e abaixo do espaço pra voto um espaço que mostre os comentários e que seja possível comentar. Importante, caso o usuario vote em reprovar ou discutir em comitê sugerir que ele coloque um comentário do porque ele fez isso. Os comentários devem ter a funcionalidade de “resposta” e like. Além disso, em algum lugar da página devemos tem uma sinalização em farois das três aprovações que teremos para cada caso: Aprovação time de gestão, aprovação risco e diretoria, com um comentário realizado por cada um abaixo desse farol. Esses comentários e aprovações devem ser os mesmos apresentados na pagina do comite especifico. Nessa pagina, devemos ter em algum lugar o nome da revisão e para qual comite e data que ela foi submetida. Caso o vídeo não esteja disponível, devemos ter essa indicação.   
  * Importante, para aprovações os usuários devem ser capazes de aprovar ou na pagina de comite especifico ou na pagina do vídeo. E na pagina de resumo de comites, caso haja uma aprovação pendente desse usuario, ela deve ser sinalizada e ele deve ser capaz de acessar a pagina da aprovação pendente por lá  
  * Essas aprovações devem ser atribuídas a pessoas especificas, que vamos ter que definir apos a implementação do microsoft entra id. Para as demais não deve ficar disponivel as aprovações.   
    * Enquanto não tivermos o microsoft entra id e no ambiente de testes, devemos ser capazes de visualizar a experiencia de cada parte: Gestor (com poder de voto no voto da gestão), diretor de risco (com poder de voto no risco), diretor presidente (poder de voto no voto do diretor) e usuário comum (pode visualizar mas nao pode votar)  
  * Tudo relacionado ao comitÊ (pauta, ações, comentários, atas, resumos) devem ser salvos num schema novo do sql: cri\_cra\_dev.comite  
  * Os itens relacionados com operações ativas ou em estruturação, devem salvar as tarefas e eventos nas tabelas respectivas da operação  
  * A pagina de comite especifico deve ser capaz de enviar a pauta por e-mail num horario a ser configurado no dia anterior ao dia do comitê. Essa opção pode ser desabilitada

* Ajustes Gerais:  
  * Implementar microsoft entra id  
    * Com essa implementação, a aplicação deve entender que o analista é o usuario logado pela microsoft  
    * Devemos ser capazes de definir cargos para pessoas específicas. Cargos:  
      * Administrador  
      * Risco  
      * Gestor  
      * Diretor Presidente  
      * Usuário comum  
      * Analista  
    * Os analistas e gestores podem criar operações e tarefas nas paginas de operação ativa e originação.   
    * Devem haver páginas Hub do analista para os membros marcados como Analistas  
    * O administrador deve ter poder em todas as ferramentas e pode ter outros cargos  
    * O usuário comum deve ter acesso a todas as páginas do site, mas não terá sua propria pagina no hub do analista  
    * Os usuários marcados como Risco, podem realizar votos no comitê pelo voto de risco  
    * Os usuários marcados como gestão podem realizar votos no comitê pelo voto do time de gestão  
    * Os usuários marcados como Diretor Presidente podem realizar votos por no voto Diretor Presidente  
    * O administrador deve ser capaz de dar cargos a usuarios e deve ser capaz de ligar/desligar o entra id para testes no ambiente de testes  
  * Separar em rotas diferentes as paginas de comitê, originação e monitoramento (operações ativas). Organizar as pastas e os componentes para seguirem essa logica e facilitarem a organização.  
  *  ajustar deletes no sync, parece que o sistema não está conseguindo fazer deletes quando ele joga os deletes para a fila de update  
    * Erro:   
      * Request URL [https://crm-credito.azurewebsites.net/api/operations/sync-all](https://crm-credito.azurewebsites.net/api/operations/sync-all) Request Method POST Status Code 500 INTERNAL SERVER ERROR Remote Address [10.50.12.52:8080](http://10.50.12.52:8080/) Referrer Policy strict-origin-when-cross-origin content-type text/plain;charset=UTF-8 referer [https://front-crm-cri.azurewebsites.net/](https://front-crm-cri.azurewebsites.net/) sec-ch-ua "Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146" sec-ch-ua-mobile ?0 sec-ch-ua-platform "Windows" user-agent Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/[146.0.0.0](http://146.0.0.0/) Safari/537.36  
      * \[{area: "Geral", callFrequency: "Anual", contacts: \[\], covenants: {dscr: null, ltv: null},…},…\] 0 : {area: "Geral", callFrequency: "Anual", contacts: \[\], covenants: {dscr: null, ltv: null},…} 1 : {area: "Geral", callFrequency: "Anual", contacts: \[\], covenants: {dscr: null, ltv: null},…} 2 : {area: "CRI", callFrequency: "Trimestral", contacts: \[\], covenants: {dscr: null, ltv: null},…}  
      *    
      * 2026-03-27T21:58:05.3975304Z ERROR:app:Error in /api/operations/sync-all: 415 Unsupported Media Type: Did not attempt to load JSON data because the request Content-Type was not 'application/json'.  
      * 2026-03-27T21:58:05.3975514Z Traceback (most recent call last):  
      * 2026-03-27T21:58:05.3975540Z   File "/app/app.py", line 526, in sync\_all\_operations  
      * 2026-03-27T21:58:05.3975562Z     data \= request.json *\# Expecting a list of operations*  
      * 2026-03-27T21:58:05.3975583Z        	^^^^^^^^^^^^  
      * 2026-03-27T21:58:05.3975608Z   File "/usr/local/lib/python3.11/site-packages/werkzeug/wrappers/request.py", line 560, in json  
      * 2026-03-27T21:58:05.3975629Z     return self.get\_json()  
      * 2026-03-27T21:58:05.3975805Z        	^^^^^^^^^^^^^^^  
      * 2026-03-27T21:58:05.3975837Z   File "/usr/local/lib/python3.11/site-packages/werkzeug/wrappers/request.py", line 604, in get\_json  
      * 2026-03-27T21:58:05.3975904Z     return self.on\_json\_loading\_failed(None)  
      * 2026-03-27T21:58:05.3975929Z        	^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  
      * 2026-03-27T21:58:05.3975953Z   File "/usr/local/lib/python3.11/site-packages/flask/wrappers.py", line 131, in on\_json\_loading\_failed  
      * 2026-03-27T21:58:05.3975974Z     return super().on\_json\_loading\_failed(e)  
      * 2026-03-27T21:58:05.3975995Z        	^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  
      * 2026-03-27T21:58:05.3976022Z   File "/usr/local/lib/python3.11/site-packages/werkzeug/wrappers/request.py", line 647, in on\_json\_loading\_failed  
      * 2026-03-27T21:58:05.3976044Z     raise UnsupportedMediaType(  
      * 2026-03-27T21:58:05.3976075Z werkzeug.exceptions.UnsupportedMediaType: 415 Unsupported Media Type: Did not attempt to load JSON data because the request Content-Type was not 'application/json'.  
      * 2026-03-27T21:58:05.3982486Z INFO:databricks.sql.client:Closing session 01f12a28-0870-1471-8d68-e2fc24a06a10  
      * 2026-03-27T21:58:09.0239378Z INFO:databricks.sql.client:Successfully opened session 01f12a28-0a99-1af4-81de-03bd28ea12e6  
      * 2026-03-27T21:58:09.0244289Z ERROR:app:Error in /api/operations/sync-all: 415 Unsupported Media Type: Did not attempt to load JSON data because the request Content-Type was not 'application/json'.  
      * 2026-03-27T21:58:09.0244502Z Traceback (most recent call last):  
      * 2026-03-27T21:58:09.0244532Z   File "/app/app.py", line 526, in sync\_all\_operations  
      * 2026-03-27T21:58:09.0244556Z     data \= request.json *\# Expecting a list of operations*  
      * 2026-03-27T21:58:09.0244579Z        	^^^^^^^^^^^^  
      * 2026-03-27T21:58:09.0244602Z   File "/usr/local/lib/python3.11/site-packages/werkzeug/wrappers/request.py", line 560, in json  
      * 2026-03-27T21:58:09.0244620Z     return self.get\_json()  
      * 2026-03-27T21:58:09.0244639Z        	^^^^^^^^^^^^^^^  
      * 2026-03-27T21:58:09.0244663Z   File "/usr/local/lib/python3.11/site-packages/werkzeug/wrappers/request.py", line 604, in get\_json  
      * 2026-03-27T21:58:09.0244683Z     return self.on\_json\_loading\_failed(None)  
      * 2026-03-27T21:58:09.0244749Z        	^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  
      * 2026-03-27T21:58:09.0244775Z   File "/usr/local/lib/python3.11/site-packages/flask/wrappers.py", line 131, in on\_json\_loading\_failed  
      * 2026-03-27T21:58:09.0244803Z     return super().on\_json\_loading\_failed(e)  
      * 2026-03-27T21:58:09.0244823Z        	^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  
      * 2026-03-27T21:58:09.0244849Z   File "/usr/local/lib/python3.11/site-packages/werkzeug/wrappers/request.py", line 647, in on\_json\_loading\_failed  
      * 2026-03-27T21:58:09.0244871Z     raise UnsupportedMediaType(  
      * 2026-03-27T21:58:09.0244900Z werkzeug.exceptions.UnsupportedMediaType: 415 Unsupported Media Type: Did not attempt to load JSON data because the request Content-Type was not 'application/json'.  
      * 2026-03-27T21:58:09.0252596Z INFO:databricks.sql.client:Closing session 01f12a28-0a99-1af4-81de-03bd28ea12e6  
* 

\-


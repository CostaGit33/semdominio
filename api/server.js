require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const PORT = process.env.PORT || 3000;
const DEFAULT_PARTIDA = "atual";
const MAX_TIMES = 5;
const MAX_JOGADORES_TIME = 7;

function calculatePoints(vitorias = 0, empate = 0, defesa = 0, gols = 0, infracoes = 0) {
  return (Number(vitorias) * 3) + (Number(empate) * 1) + (Number(defesa) * 1) + (Number(gols) * 2) - (Number(infracoes) * 2);
}

function normalizePlayer(data = {}) {
  const jogador = {
    nome: data.nome?.trim() || "Sem nome",
    foto: data.foto || null,
    vitorias: Number(data.vitorias) || 0,
    empate: Number(data.empate) || 0,
    defesa: Number(data.defesa) || 0,
    gols: Number(data.gols) || 0,
    infracoes: Number(data.infracoes) || 0
  };
  jogador.pontos = calculatePoints(jogador.vitorias, jogador.empate, jogador.defesa, jogador.gols, jogador.infracoes);
  return jogador;
}

function partidaId(req) {
  const valor = String(req.query.partida || req.body?.partida || DEFAULT_PARTIDA).trim();
  return valor.slice(0, 80) || DEFAULT_PARTIDA;
}

async function ensureMontagemTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS montagem_times (
      id BIGSERIAL PRIMARY KEY,
      partida VARCHAR(80) NOT NULL DEFAULT 'atual',
      jogador_id INTEGER NOT NULL REFERENCES jogadores(id) ON DELETE CASCADE,
      time_num INTEGER NOT NULL CHECK (time_num BETWEEN 1 AND 5),
      ordem INTEGER NOT NULL,
      criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (partida, jogador_id),
      UNIQUE (partida, ordem)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_montagem_times_partida ON montagem_times (partida, time_num, ordem)`);
}

async function ensurePartidaOperacoesTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partida_operacoes (
      id BIGSERIAL PRIMARY KEY,
      operacao_id VARCHAR(255) NOT NULL UNIQUE,
      jogadores_afetados JSONB,
      processada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_partida_operacoes_id ON partida_operacoes (operacao_id)`);
}

app.get("/", (req, res) => res.json({ status: "online", message: "API FutPontos ONLINE" }));

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", api: "online", database: "online" });
  } catch (err) {
    console.error("Health check DB:", err.message);
    res.status(503).json({ status: "degraded", api: "online", database: "offline" });
  }
});

app.get("/manifest.json", (req, res) => res.sendFile(path.join(__dirname, "public", "manifest.json")));
app.get("/sw.js", (req, res) => {
  res.setHeader("Service-Worker-Allowed", "/");
  res.setHeader("Content-Type", "application/javascript");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});

app.get("/jogadores", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM jogadores ORDER BY pontos DESC, vitorias DESC, gols DESC`);
    res.json(result.rows);
  } catch (err) { console.error("Erro ao buscar jogadores:", err); res.status(500).json({ error: "Erro ao buscar jogadores" }); }
});

app.get("/jogadores/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM jogadores WHERE id = $1", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Jogador não encontrado" });
    res.json(result.rows[0]);
  } catch (err) { console.error("Erro ao buscar jogador:", err); res.status(500).json({ error: "Erro ao buscar jogador" }); }
});

app.post("/jogadores", async (req, res) => {
  const jogador = normalizePlayer(req.body);
  try {
    const result = await pool.query(`INSERT INTO jogadores (nome, pontos, vitorias, empate, defesa, gols, infracoes, foto) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [jogador.nome, jogador.pontos, jogador.vitorias, jogador.empate, jogador.defesa, jogador.gols, jogador.infracoes, jogador.foto]);
    res.status(201).json(result.rows[0]);
  } catch (err) { console.error("Erro ao salvar jogador:", err); res.status(500).json({ error: "Erro ao salvar jogador" }); }
});

app.put("/jogadores/:id", async (req, res) => {
  const jogador = normalizePlayer(req.body);
  try {
    const result = await pool.query(`UPDATE jogadores SET nome=$1,pontos=$2,vitorias=$3,empate=$4,defesa=$5,gols=$6,infracoes=$7,foto=$8 WHERE id=$9 RETURNING *`, [jogador.nome, jogador.pontos, jogador.vitorias, jogador.empate, jogador.defesa, jogador.gols, jogador.infracoes, jogador.foto, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Jogador não encontrado" });
    res.json(result.rows[0]);
  } catch (err) { console.error("Erro ao atualizar jogador:", err); res.status(500).json({ error: "Erro ao atualizar jogador" }); }
});

app.delete("/jogadores/:id", async (req, res) => {
  try {
    const result = await pool.query("DELETE FROM jogadores WHERE id=$1 RETURNING *", [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: "Jogador não encontrado" });
    res.json({ success: true });
  } catch (err) { console.error("Erro ao excluir jogador:", err); res.status(500).json({ error: "Erro ao excluir jogador" }); }
});

app.get("/desempenho", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT j.id,j.nome,j.pontos,j.vitorias,j.empate,j.gols,j.defesa AS defesa_classificacao,j.infracoes,j.foto,
      a.defesa AS avaliacao_defesa,a.ataque AS avaliacao_ataque,a.velocidade AS avaliacao_velocidade,a.habilidade AS avaliacao_habilidade,a.passe AS avaliacao_passe
      FROM jogadores j LEFT JOIN avaliacao_jogadores a ON a.jogador_id=j.id
      WHERE j.id NOT IN (31,47) ORDER BY j.pontos DESC,j.nome ASC`);
    res.json(result.rows.map(j => ({
      id:j.id,nome:j.nome,pontos:j.pontos,vitorias:j.vitorias,empate:j.empate,gols:j.gols,defesaClassificacao:j.defesa_classificacao,infracoes:j.infracoes,foto:j.foto,
      avaliacao:[j.avaliacao_defesa,j.avaliacao_ataque,j.avaliacao_velocidade,j.avaliacao_habilidade,j.avaliacao_passe].some(v=>v!==null&&v!==undefined)?{defesa:j.avaliacao_defesa,ataque:j.avaliacao_ataque,velocidade:j.avaliacao_velocidade,habilidade:j.avaliacao_habilidade,passe:j.avaliacao_passe}:null
    })));
  } catch (err) { console.error("Erro ao buscar desempenho técnico:", err); res.status(500).json({ error: "Erro ao buscar desempenho técnico" }); }
});

app.get("/montar-times", async (req, res) => {
  const partida = partidaId(req);
  try {
    const result = await pool.query(`SELECT m.id,m.partida,m.jogador_id,m.time_num,m.ordem,m.criado_em,j.nome,j.pontos,j.vitorias,j.empate,j.gols,j.defesa AS defesa_classificacao,j.infracoes,j.foto,a.defesa AS avaliacao_defesa,a.ataque AS avaliacao_ataque,a.velocidade AS avaliacao_velocidade,a.habilidade AS avaliacao_habilidade,a.passe AS avaliacao_passe FROM montagem_times m JOIN jogadores j ON j.id=m.jogador_id LEFT JOIN avaliacao_jogadores a ON a.jogador_id=j.id WHERE m.partida=$1 ORDER BY m.ordem ASC`, [partida]);
    res.json({ partida, selecoes: result.rows });
  } catch (err) { console.error("Erro ao buscar montagem:", err); res.status(500).json({ error: "Erro ao buscar montagem de times" }); }
});

app.post("/montar-times/selecionar", async (req, res) => {
  const partida = partidaId(req), jogadorId = Number(req.body.jogador_id ?? req.body.jogadorId), timeNum = Number(req.body.time_num ?? req.body.time);
  if (!Number.isInteger(jogadorId) || jogadorId<=0) return res.status(400).json({error:"jogador_id inválido"});
  if (!Number.isInteger(timeNum) || timeNum<1 || timeNum>MAX_TIMES) return res.status(400).json({error:"time inválido"});
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[partida]);
    const jogador=await client.query("SELECT id,nome FROM jogadores WHERE id=$1",[jogadorId]);
    if(!jogador.rows.length){await client.query("ROLLBACK");return res.status(404).json({error:"Jogador não encontrado"});}
    const existente=await client.query("SELECT id,time_num,ordem FROM montagem_times WHERE partida=$1 AND jogador_id=$2",[partida,jogadorId]);
    if(existente.rows.length){await client.query("ROLLBACK");return res.status(409).json({error:"Jogador já foi escolhido",selecao:existente.rows[0]});}
    const quantidade=await client.query("SELECT COUNT(*)::int AS total FROM montagem_times WHERE partida=$1 AND time_num=$2",[partida,timeNum]);
    if(quantidade.rows[0].total>=MAX_JOGADORES_TIME){await client.query("ROLLBACK");return res.status(409).json({error:"Este time já atingiu 7 jogadores"});}
    const ordemResult=await client.query("SELECT COALESCE(MAX(ordem),0)+1 AS ordem FROM montagem_times WHERE partida=$1",[partida]);
    const inserido=await client.query(`INSERT INTO montagem_times(partida,jogador_id,time_num,ordem) VALUES($1,$2,$3,$4) RETURNING id,partida,jogador_id,time_num,ordem,criado_em`,[partida,jogadorId,timeNum,Number(ordemResult.rows[0].ordem)]);
    await client.query("COMMIT");
    res.status(201).json({success:true,jogador:jogador.rows[0],selecao:inserido.rows[0]});
  } catch(err){try{await client.query("ROLLBACK")}catch(_){} console.error("Erro ao selecionar jogador:",err); if(err.code==="23505")return res.status(409).json({error:"Jogador já foi escolhido por outro líder"}); res.status(500).json({error:"Erro ao registrar seleção"});} finally{client.release();}
});

app.delete("/montar-times/:jogadorId", async (req,res)=>{
  const partida=partidaId(req), jogadorId=Number(req.params.jogadorId);
  if(!Number.isInteger(jogadorId)||jogadorId<=0)return res.status(400).json({error:"jogadorId inválido"});
  try{const result=await pool.query("DELETE FROM montagem_times WHERE partida=$1 AND jogador_id=$2 RETURNING *",[partida,jogadorId]);if(!result.rows.length)return res.status(404).json({error:"Seleção não encontrada"});res.json({success:true,selecao:result.rows[0]});}catch(err){console.error("Erro ao remover seleção:",err);res.status(500).json({error:"Erro ao remover seleção"});}
});

app.delete("/montar-times", async (req,res)=>{const partida=partidaId(req);try{const result=await pool.query("DELETE FROM montagem_times WHERE partida=$1 RETURNING id",[partida]);res.json({success:true,removidos:result.rowCount});}catch(err){console.error("Erro ao limpar montagem:",err);res.status(500).json({error:"Erro ao limpar montagem"});}});

app.get("/goleiros", async (req,res)=>{try{const result=await pool.query("SELECT * FROM goleiros ORDER BY pontos DESC,vitorias DESC,defesa DESC");res.json(result.rows);}catch(err){console.error("Erro ao buscar goleiros:",err);res.status(500).json({error:"Erro ao buscar goleiros"});}});
app.get("/goleiros/:id", async (req,res)=>{try{const result=await pool.query("SELECT * FROM goleiros WHERE id=$1",[req.params.id]);if(!result.rows.length)return res.status(404).json({error:"Goleiro não encontrado"});res.json(result.rows[0]);}catch(err){console.error("Erro ao buscar goleiro:",err);res.status(500).json({error:"Erro ao buscar goleiro"});}});
app.post("/goleiros", async (req,res)=>{const goleiro=normalizePlayer(req.body);try{const result=await pool.query("INSERT INTO goleiros (nome,pontos,vitorias,empate,defesa,gols,infracoes,foto) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[goleiro.nome,goleiro.pontos,goleiro.vitorias,goleiro.empate,goleiro.defesa,goleiro.gols,goleiro.infracoes,goleiro.foto]);res.status(201).json(result.rows[0]);}catch(err){console.error("Erro ao salvar goleiro:",err);res.status(500).json({error:"Erro ao salvar goleiro"});}});
app.put("/goleiros/:id", async (req,res)=>{const goleiro=normalizePlayer(req.body);try{const result=await pool.query("UPDATE goleiros SET nome=$1,pontos=$2,vitorias=$3,empate=$4,defesa=$5,gols=$6,infracoes=$7,foto=$8 WHERE id=$9 RETURNING *",[goleiro.nome,goleiro.pontos,goleiro.vitorias,goleiro.empate,goleiro.defesa,goleiro.gols,goleiro.infracoes,goleiro.foto,req.params.id]);if(!result.rows.length)return res.status(404).json({error:"Goleiro não encontrado"});res.json(result.rows[0]);}catch(err){console.error("Erro ao atualizar goleiro:",err);res.status(500).json({error:"Erro ao atualizar goleiro"});}});
app.delete("/goleiros/:id", async (req,res)=>{try{const result=await pool.query("DELETE FROM goleiros WHERE id=$1 RETURNING *",[req.params.id]);if(!result.rows.length)return res.status(404).json({error:"Goleiro não encontrado"});res.json({success:true});}catch(err){console.error("Erro ao excluir goleiro:",err);res.status(500).json({error:"Erro ao excluir goleiro"});}});

function validateRegistroPartida(data){
  const erros=[];
  if(!data.operacao_id||typeof data.operacao_id!=="string"||data.operacao_id.trim()==="")erros.push("operacao_id é obrigatório e deve ser string");
  if(data.coletivo){
    if(!Array.isArray(data.coletivo.jogadores))erros.push("coletivo.jogadores deve ser array");
    else if(data.coletivo.jogadores.length===0)erros.push("coletivo.jogadores não pode estar vazio");
    for(const campo of ["vitorias","empate","defesa","gols","infracoes"]){if(data.coletivo[campo]!==undefined&&typeof data.coletivo[campo]!=="number")erros.push(`coletivo.${campo} deve ser number`);if(data.coletivo[campo]!==undefined&&data.coletivo[campo]<0)erros.push(`coletivo.${campo} não pode ser negativo`);}
  }
  if(data.individual&&Array.isArray(data.individual))for(const evento of data.individual){if(!Number.isInteger(evento.jogador_id)||evento.jogador_id<=0)erros.push(`individual: jogador_id inválido (${evento.jogador_id})`);for(const campo of ["vitorias","empate","defesa","gols","infracoes"]){if(evento[campo]!==undefined&&typeof evento[campo]!=="number")erros.push(`individual[${evento.jogador_id}].${campo} deve ser number`);if(evento[campo]!==undefined&&evento[campo]<0)erros.push(`individual[${evento.jogador_id}].${campo} não pode ser negativo`);}}
  return erros;
}

app.post("/partida/registrar", async (req,res)=>{
  const {operacao_id,coletivo,individual}=req.body;
  const erros=validateRegistroPartida(req.body);
  if(erros.length)return res.status(400).json({error:"Validação falhou",detalhes:erros});
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const jaProcessada=await client.query("SELECT operacao_id FROM partida_operacoes WHERE operacao_id=$1",[operacao_id]);
    if(jaProcessada.rows.length){await client.query("ROLLBACK");return res.status(409).json({error:"Operação já foi processada",operacao_id});}
    const todosIds=new Set();
    if(coletivo&&Array.isArray(coletivo.jogadores))coletivo.jogadores.forEach(id=>todosIds.add(id));
    if(individual&&Array.isArray(individual))individual.forEach(e=>todosIds.add(e.jogador_id));
    if(todosIds.size){const resultado=await client.query("SELECT id FROM jogadores WHERE id=ANY($1)",[Array.from(todosIds)]);const encontrados=new Set(resultado.rows.map(r=>r.id));const faltando=Array.from(todosIds).filter(id=>!encontrados.has(id));if(faltando.length){await client.query("ROLLBACK");return res.status(400).json({error:"Jogadores não encontrados",ids:faltando});}}
    const atualizacoes={};
    if(coletivo&&Array.isArray(coletivo.jogadores))for(const id of coletivo.jogadores){if(!atualizacoes[id])atualizacoes[id]={vitorias:0,empate:0,defesa:0,gols:0,infracoes:0};for(const campo of ["vitorias","empate","defesa","gols","infracoes"])if(coletivo[campo]!==undefined)atualizacoes[id][campo]+=coletivo[campo];}
    if(individual&&Array.isArray(individual))for(const e of individual){const {jogador_id,vitorias,empate,defesa,gols,infracoes}=e;if(!atualizacoes[jogador_id])atualizacoes[jogador_id]={vitorias:0,empate:0,defesa:0,gols:0,infracoes:0};if(vitorias!==undefined)atualizacoes[jogador_id].vitorias+=vitorias;if(empate!==undefined)atualizacoes[jogador_id].empate+=empate;if(defesa!==undefined)atualizacoes[jogador_id].defesa+=defesa;if(gols!==undefined)atualizacoes[jogador_id].gols+=gols;if(infracoes!==undefined)atualizacoes[jogador_id].infracoes+=infracoes;}
    const jogadoresAtualizados=[];
    for(const [idStr,inc] of Object.entries(atualizacoes)){
      const id=Number(idStr), atualResult=await client.query("SELECT * FROM jogadores WHERE id=$1",[id]);
      if(!atualResult.rows.length){await client.query("ROLLBACK");return res.status(400).json({error:"Jogador não encontrado durante processamento",jogador_id:id});}
      const atual=atualResult.rows[0];
      const novos={vitorias:Math.max(0,(atual.vitorias||0)+(inc.vitorias||0)),empate:Math.max(0,(atual.empate||0)+(inc.empate||0)),defesa:Math.max(0,(atual.defesa||0)+(inc.defesa||0)),gols:Math.max(0,(atual.gols||0)+(inc.gols||0)),infracoes:Math.max(0,(atual.infracoes||0)+(inc.infracoes||0))};
      const pontos=calculatePoints(novos.vitorias,novos.empate,novos.defesa,novos.gols,novos.infracoes);
      const atualizado=await client.query("UPDATE jogadores SET vitorias=$1,empate=$2,defesa=$3,gols=$4,infracoes=$5,pontos=$6 WHERE id=$7 RETURNING *",[novos.vitorias,novos.empate,novos.defesa,novos.gols,novos.infracoes,pontos,id]);
      jogadoresAtualizados.push(atualizado.rows[0]);
    }
    await client.query("INSERT INTO partida_operacoes (operacao_id,jogadores_afetados) VALUES($1,$2)",[operacao_id,JSON.stringify(Object.keys(atualizacoes).map(Number))]);
    await client.query("COMMIT");
    res.status(201).json({success:true,operacao_id,jogadores_atualizados:jogadoresAtualizados,total:jogadoresAtualizados.length});
  }catch(err){try{await client.query("ROLLBACK")}catch(_){}console.error("Erro ao registrar partida:",err);res.status(500).json({error:"Erro ao registrar partida",detalhes:err.message});}finally{client.release();}
});

/* ======================================================
   START SERVER

   A API deve abrir a porta mesmo se uma migração de banco
   falhar. Isso evita que o proxy/Cloudflare receba 502.
   As tabelas são preparadas em segundo plano.
====================================================== */

app.listen(PORT, () => {
  console.log(`API FutPontos rodando na porta ${PORT}`);
  Promise.all([ensureMontagemTable(), ensurePartidaOperacoesTable()])
    .then(() => console.log("Banco preparado com sucesso."))
    .catch((err) => console.error("Erro ao preparar banco de dados (API continua online):", err));
});

process.on("SIGTERM", async () => {
  await pool.end().catch(() => {});
  process.exit(0);
});

process.on("SIGINT", async () => {
  await pool.end().catch(() => {});
  process.exit(0);
});

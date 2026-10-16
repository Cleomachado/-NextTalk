"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { jget, GroupListItem } from "@/lib/client";

// Carrega a lista de grupos do número (pro seletor) + mantém um mapa jid→nome.
// A lista pode demorar/falhar (chama a UazAPI) sem quebrar a tela.
// `refresh()` = busca à força direto do WhatsApp (grupo novo não aparece no cache na hora).
// `account` = de QUAL número carregar os grupos. Grupo pertence ao aparelho: sem dizer o número,
// o motor respondia pelo primário e o seletor mostrava grupos de outro WhatsApp (relatado 19/08).
export function useGroupList(account?: string) {
  const [groupList, setGroupList] = useState<GroupListItem[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [groupsErr, setGroupsErr] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false); // distingue "carregando" de "carregou e está vazio"
  const [refreshing, setRefreshing] = useState(false);

  const addName = useCallback((jid: string, name: string) => {
    if (jid && name) setNames((m) => ({ ...m, [jid]: name }));
  }, []);

  // Sequência de requisições: só a resposta MAIS RECENTE aplica (a carga inicial lenta não pode
  // aterrissar DEPOIS do refresh e sobrescrever a lista fresca com a velha).
  const seq = useRef(0);
  const url = useCallback((extra: string) => {
    const p = new URLSearchParams(extra);
    if (account && account !== "lite" && account !== "api") p.set("account", account);
    const q = p.toString();
    return "/api/groups" + (q ? "?" + q : "");
  }, [account]);

  const apply = useCallback((list: GroupListItem[]) => {
    setGroupList(list);
    setNames((m) => {
      const n = { ...m };
      list.forEach((x) => {
        if (x.jid && x.name) n[x.jid] = x.name;
      });
      return n;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    const my = ++seq.current;
    jget(url(""))
      .then((g) => {
        if (!alive || my !== seq.current) return;
        apply(g.groups ?? []);
      })
      .catch((e) => alive && my === seq.current && setGroupsErr(e.message))
      .finally(() => alive && setLoaded(true));
    // O motor responde na hora com a lista MEMORIZADA e confere no WhatsApp em 2º plano.
    // Esta re-busca silenciosa pega o resultado da conferência na mesma sessão (grupo novo
    // entra / grupo que saiu some) sem o usuário clicar em nada.
    const t = setTimeout(() => {
      if (!alive) return;
      const my2 = ++seq.current;
      jget(url(""))
        .then((g) => alive && my2 === seq.current && apply(g.groups ?? []))
        .catch(() => {});
    }, 8000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [apply, url]);

  const refresh = useCallback(async () => {
    const my = ++seq.current;
    setRefreshing(true);
    try {
      const g = await jget(url("refresh=1")); // demora ~5-10s: vai direto no WhatsApp
      if (my !== seq.current) return;
      apply(g.groups ?? []);
      setGroupsErr(null);
    } catch (e: any) {
      if (my === seq.current) setGroupsErr(e.message);
    } finally {
      if (my === seq.current) setRefreshing(false);
    }
  }, [apply, url]);

  return { groupList, names, addName, groupsErr, loaded, refresh, refreshing };
}

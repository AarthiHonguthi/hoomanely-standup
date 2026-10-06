"use client";

import { ChevronDown, Users, X } from "lucide-react";
import { Avatar } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { sortPeople } from "@/lib/data/selectors";
import { useData } from "@/lib/data/store";
import { useUI } from "@/lib/ui-state";

export function PeopleFilter() {
  const { data, currentUserId } = useData();
  const { personIds, setPersonIds } = useUI();
  const people = sortPeople(data.people);
  const everyone = personIds.length === 0;
  const selected = people.filter((p) => personIds.includes(p.id));
  const groups = data.teams
    .map((team) => ({ team, members: people.filter((p) => p.teamId === team.id) }))
    .filter((g) => g.members.length > 0);

  // Name the selection by team when it is exactly one or more whole teams.
  const wholeTeams = groups.filter((g) => g.members.every((m) => personIds.includes(m.id)));
  const coveredByTeams = wholeTeams.reduce((n, g) => n + g.members.length, 0) === selected.length;
  const label = everyone
    ? "Everyone"
    : coveredByTeams && wholeTeams.length > 0 && wholeTeams.length <= 2 && !(wholeTeams.length === 1 && selected.length === 1)
      ? wholeTeams.map((g) => g.team.name).join(" + ")
      : selected.length === 1
        ? selected[0].name
        : `${selected.length} people`;

  const apply = (next: string[]) => setPersonIds(next.length === people.length ? [] : next);
  const toggle = (id: string) => apply(personIds.includes(id) ? personIds.filter((p) => p !== id) : [...personIds, id]);
  const toggleTeam = (memberIds: string[], allSelected: boolean) =>
    apply(allSelected ? personIds.filter((id) => !memberIds.includes(id)) : [...new Set([...personIds, ...memberIds])]);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="secondary" aria-label={`People filter: ${label}`}>
            <Users />
            <span className="max-w-44 truncate">{label}</span>
            <ChevronDown className="text-subtle" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0">
          <div className="flex items-center justify-between px-4 pb-2 pt-3">
            <p className="text-xs font-medium text-subtle">Show check-ins from</p>
            <button className="rounded text-xs font-medium text-primary-soft-fg hover:underline" onClick={() => setPersonIds([currentUserId])}>
              Only me
            </button>
          </div>
          <div className="px-2">
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
              <Checkbox checked={everyone} onCheckedChange={() => setPersonIds([])} />
              <span className="font-medium">Everyone</span>
            </label>
          </div>
          <div className="max-h-[min(60vh,26rem)] overflow-y-auto px-2 pb-2">
            {groups.map(({ team, members }) => {
              const ids = members.map((m) => m.id);
              const count = ids.filter((id) => personIds.includes(id)).length;
              const all = count === ids.length;
              return (
                <div key={team.id} role="group" aria-label={`${team.name} team`} className="mt-1 border-t border-border pt-1">
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-surface-2">
                    <Checkbox
                      checked={all ? true : count > 0 ? "indeterminate" : false}
                      onCheckedChange={() => toggleTeam(ids, all)}
                      aria-label={`Select the whole ${team.name} team`}
                    />
                    <span className="flex-1 font-semibold">{team.name}</span>
                    <span className="text-xs text-subtle">{members.length}</span>
                  </label>
                  <ul>
                    {members.map((p) => (
                      <li key={p.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-md py-1.5 pl-7 pr-2 text-sm hover:bg-surface-2">
                          <Checkbox checked={personIds.includes(p.id)} onCheckedChange={() => toggle(p.id)} />
                          <Avatar person={p} size="xs" />
                          <span className="min-w-0 flex-1 truncate">
                            {p.name}
                            {p.id === currentUserId && <span className="text-subtle"> (you)</span>}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {selected.length > 1 && selected.length <= 4 && !(coveredByTeams && wholeTeams.length > 0) && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected people">
          {selected.map((p) => (
            <li key={p.id}>
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-1 text-xs font-medium">
                <Avatar person={p} size="xs" />
                {p.name.split(" ")[0]}
                <button
                  onClick={() => toggle(p.id)}
                  className="rounded-full p-0.5 text-subtle hover:bg-surface-2 hover:text-text"
                  aria-label={`Remove ${p.name} from filter`}
                >
                  <X className="size-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

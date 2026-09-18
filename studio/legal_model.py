"""Pinned legal profile, shared by the catalog and the isolated GPU worker."""
import hashlib
import json
from pathlib import Path

PROFILE = 'profiles/lora-v3-experimental.json'
EXPERIMENT = 'experiments/20260910-lora-v3'
ADAPTER_SHA = '7714f6005da80d9eeccfda8ba3e87bac97f2dde80eba8f955547250ce27dc556'
PROMPT_SHA = '980f0c957ac9c2c5de49e7c7c94c153c99fa2bda09d6f526e93c12457ea02f1e'
REVISION = '0e42af58449718de7931ee04f28191fbe6c43a56'


def read(path):
    return json.loads(Path(path).read_text())


def profile(root):
    data = read(root / PROFILE)
    base = Path(data['base_model'])
    adapter = Path(data['adapter_path'])
    expected_base = Path.home() / '.cache/huggingface/hub/models--mlx-community--Qwen3-4B-Instruct-2507-8bit/snapshots' / REVISION
    if base.resolve() != expected_base.resolve() or not (base / 'config.json').is_file():
        raise ValueError('La base juridique 4B figée est indisponible.')
    if adapter.resolve() != (root / EXPERIMENT / 'adapters/best').resolve():
        raise ValueError('Le profil ne désigne pas le LoRA juridique V3.')
    if data['adapter_sha256'] != ADAPTER_SHA or hashlib.sha256((adapter / 'adapters.safetensors').read_bytes()).hexdigest() != ADAPTER_SHA:
        raise ValueError('Les poids du LoRA juridique V3 ont changé.')
    if data['system_prompt_sha256'] != PROMPT_SHA or hashlib.sha256(data['system_prompt'].encode()).hexdigest() != PROMPT_SHA:
        raise ValueError('Les consignes évaluées du LoRA juridique V3 ont changé.')
    if Path(read(adapter / 'adapter_config.json')['model']).resolve() != base.resolve():
        raise ValueError('Adaptateur et modèle de base incompatibles.')
    if not (root / 'data/index.sqlite').is_file():
        raise ValueError('L’index des codes juridiques est indisponible.')
    if not list(base.glob('*.safetensors')):
        raise ValueError('Les poids de base sont indisponibles.')
    return data


def model_info(root, spec, ident):
    info = {'id': ident, 'name': spec['name'], 'description': spec['description'], 'domains': spec['domains'],
            'version': 'v3', 'parameters': '4B', 'available': False, 'size_gb': 0, 'category': None,
            'dataset': {}, 'metrics': {}, 'experimental': True, 'evaluated': False,
            'validation_gate': False, 'supports_training': False, 'preparation': {}}
    try:
        data = profile(root)
        info.update(available=True, size_gb=round((sum(p.stat().st_size for p in Path(data['base_model']).glob('*.safetensors')) +
                    (Path(data['adapter_path']) / 'adapters.safetensors').stat().st_size) / 1e9, 2))
        info['dataset'] = read(root / EXPERIMENT / 'data/manifest.json')['counts']
        decision = read(root / EXPERIMENT / 'release_decision.json')
        info.update(evaluated=True, legal_assessment=decision['heldout_counts'])
    except (OSError, ValueError, KeyError) as exc:
        info['availability_error'] = str(exc)
    return info


def display_source(source):
    return {**source, 'title': f"{source['title']} · article {source['number']} [{source['id']}]",
            'author': f"Légifrance · export {source['generated_date']} · dernière modification {source['last_modified']}",
            'page': source['pages'][0] if source['pages'] else None}


def audit_notice(citations, excerpts):
    if citations['unexpected_ids'] or citations['unsupported_article_mentions'] or excerpts['unmatched_excerpts'] or excerpts['uncited_or_misattributed_excerpts']:
        return 'Une citation ou un extrait ne correspond pas aux sources fournies. Vérifiez le texte dans le panneau des sources.'
    if not excerpts['excerpts']:
        return 'Aucun extrait littéral contrôlable dans cette réponse. Vérifiez les sources.'
    return 'Extrait retrouvé dans la source citée. Cela ne valide pas le raisonnement juridique.'

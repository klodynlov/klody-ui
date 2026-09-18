import sqlite3
import unittest
from models import MODELS
from retrieve import category_books

class ModelScopeTests(unittest.TestCase):
    def test_business_uses_distinct_project_and_variant(self):
        business=MODELS['business']
        self.assertEqual(business['project'],'BusinessPratique')
        self.assertEqual(business['variant'],'business4b')
        self.assertEqual(len({m['release'] for m in MODELS.values()}),len(MODELS))

    def test_code_scope_includes_technical_books_and_repositories(self):
        code=MODELS['code']
        self.assertEqual(code['project'],'KlodyCode')
        self.assertEqual(code['variant'],'klodycode')
        self.assertIn('GitHub',code['category'])
        self.assertIn('Intelligence_artificielle',code['category'])
        self.assertNotIn('Musique',code['category'])
        self.assertGreaterEqual(code['max_output_tokens'],1200)

    def test_multi_category_search_includes_management_but_not_music(self):
        conn=sqlite3.connect(':memory:');conn.row_factory=sqlite3.Row
        conn.execute('CREATE TABLE books (id INTEGER,title TEXT,category TEXT)')
        conn.executemany('INSERT INTO books VALUES (?,?,?)',[(1,'Prix','Business'),(2,'Équipe','Management'),(3,'Son','Musique'),(4,'Stocks','Logistique')])
        self.assertEqual({r['id'] for r in category_books(conn,MODELS['business']['category'])},{1,2,4})
        self.assertEqual([r['id'] for r in category_books(conn,['Musique'])],[3])
        self.assertEqual(len(category_books(conn,[])),4)
        self.assertEqual(category_books(conn,["Business' OR 1=1 --"]),[])
        conn.close()

if __name__=='__main__':unittest.main()

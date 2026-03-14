"""Public command registrations for the CAAD ERP CLI.

Importing this module makes every command registration helper available via a
single namespace, simplifying command table composition in
``caad_erp.cli.parser`` and for any downstream tooling.
"""

from .add_product import *
from .add_salesman import *
from .deactivate_product import *
from .deactivate_salesman import *
from .debts import *
from .list_products import *
from .list_salesmen import *
from .log import *
from .pay_debt import *
from .profit import *
from .restock import *
from .sale import *
from .stock import *
from .void import *
from .write_off import *

from llama_index import (
    SimpleDirectoryReader,
    VectorStoreIndex,
    ServiceContext,
    set_global_service_context,
)

from llama_index.node_parser import SimpleNodeParser
from llama_index.llms import OpenAI

from llama_index import StorageContext, load_index_from_storage

class TextIndexer:
    def __init__(self, data_dir, index_dir):
        self.data_dir = data_dir
        self.index_dir = index_dir

    def build_index(self):
        try:
            storage_context = StorageContext.from_defaults(persist_dir=self.index_dir)
            index = load_index_from_storage(storage_context)
            return index
        except:
            print(f'No index folder, {self.index_dir}')

        documents = SimpleDirectoryReader(self.data_dir).load_data()
        parser = SimpleNodeParser.from_defaults()
        nodes = parser.get_nodes_from_documents(documents)
        index = VectorStoreIndex(nodes)
        index.storage_context.persist(persist_dir=self.index_dir)
        return index

class LanguageModel:
    def __init__(self, model_name, temperature=0, max_tokens=256):
        self.llm = OpenAI(model=model_name, temperature=temperature, max_tokens=max_tokens)
        self.service_context = ServiceContext.from_defaults(llm=self.llm)
        set_global_service_context(self.service_context)

class QueryProcessor:
    def __init__(self, index):
        self.query_engine = index.as_query_engine()

    def query(self, user_question):
        response = self.query_engine.query(user_question)
        return response